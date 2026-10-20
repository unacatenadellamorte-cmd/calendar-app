package jp.ryo.multicalendar;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.FutureTask;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 端末の写真を撮影日時の範囲で読み取る(MediaStore)。読み取り専用で、写真・識別子・日時をアプリ外へ出さない。
 * 画像はメモリ上で縮小して data URL にして返し、ディスクへは書かない。
 */
@CapacitorPlugin(name = "DevicePhotos")
public class DevicePhotosPlugin extends Plugin {
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_IMAGE_SIDE = 1600;
    private static final int JPEG_QUALITY = 80;
    private static final String PREFS = "device_photos";
    private static final String KEY_ASKED = "permission_asked";

    // 同時に画像を生成する件数(Web 側の上限と同じ2件)。
    private final ThreadPoolExecutor executor = (ThreadPoolExecutor) Executors.newFixedThreadPool(2);
    private final ThreadPoolExecutor queryExecutor = (ThreadPoolExecutor) Executors.newFixedThreadPool(1);
    private final Map<String, PhotoListLoad> lists = new ConcurrentHashMap<>();
    // 実行中・待機中の読込。取り消されたら結果を捨てる。
    private final Map<String, ImageLoad> loads = new ConcurrentHashMap<>();
    private ActivityResultLauncher<String[]> permissionLauncher;
    private PluginCall pendingPermission;

    @Override
    public void load() {
        permissionLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.RequestMultiplePermissions(), result -> finishPermissionRequest());
    }

    /** OS 版ごとに必要最小限の権限だけを求める。 */
    static String[] requestedPermissions(int sdk) {
        if (sdk >= 34) {
            return new String[] {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
            };
        }
        if (sdk >= 33) return new String[] {Manifest.permission.READ_MEDIA_IMAGES};
        return new String[] {Manifest.permission.READ_EXTERNAL_STORAGE};
    }

    /**
     * 権限の状態。Android は「未要求」と「拒否」を直接は教えないため、要求した履歴と再説明の要否から判断する。
     * 一部許可(選択した写真)は Android 14 以上でだけ存在する。
     */
    static String resolveStatus(
        int sdk, boolean fullGranted, boolean selectedGranted, boolean asked, boolean showRationale) {
        if (fullGranted) return "granted";
        if (sdk >= 34 && selectedGranted) return "limited";
        if (!asked || showRationale) return "prompt";
        return "denied";
    }

    /** 長辺が maxSide を超える場合だけ、縦横比を保って縮める(拡大はしない)。 */
    static int[] fitWithin(int width, int height, int maxSide) {
        int longest = Math.max(width, height);
        if (longest <= maxSide) return new int[] {width, height};
        return new int[] {
            (int) Math.max(1L, (long) width * maxSide / longest),
            (int) Math.max(1L, (long) height * maxSide / longest)
        };
    }

    /** 読み込み時に間引く倍率(2の累乗)。間引いた後も長辺が maxSide 以上に残る範囲に限る。 */
    static int sampleSizeFor(int width, int height, int maxSide) {
        int longest = Math.max(width, height);
        int sample = 1;
        while (longest / (sample * 2) >= maxSide) sample *= 2;
        return sample;
    }

    static boolean isValidMediaId(String id) {
        return id != null && id.matches("[0-9]{1,18}");
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission)
            == PackageManager.PERMISSION_GRANTED;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String currentStatus() {
        int sdk = Build.VERSION.SDK_INT;
        String full = sdk >= 33 ? Manifest.permission.READ_MEDIA_IMAGES : Manifest.permission.READ_EXTERNAL_STORAGE;
        return resolveStatus(
            sdk,
            granted(full),
            sdk >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED),
            prefs().getBoolean(KEY_ASKED, false),
            ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), full));
    }

    private boolean canRead() {
        String status = currentStatus();
        return status.equals("granted") || status.equals("limited");
    }

    private static JSObject statusResult(String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        return result;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        call.resolve(statusResult(currentStatus()));
    }

    /** 利用者が写真欄で操作した時だけ JS から呼ばれる。 */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        String status = currentStatus();
        if (status.equals("granted") || status.equals("limited")) {
            call.resolve(statusResult(status));
            return;
        }
        launchPermissionRequest(call);
    }

    /** 一部許可のとき、OS の選択画面で見せる写真を選び直す(権限を再要求する)。 */
    @PluginMethod
    public void manageLimitedAccess(PluginCall call) {
        if (!currentStatus().equals("limited")) {
            call.resolve(statusResult(currentStatus()));
            return;
        }
        launchPermissionRequest(call);
    }

    private void launchPermissionRequest(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pendingPermission != null) {
                call.reject("権限の確認中です", "in-progress");
                return;
            }
            pendingPermission = call;
            prefs().edit().putBoolean(KEY_ASKED, true).apply();
            permissionLauncher.launch(requestedPermissions(Build.VERSION.SDK_INT));
        });
    }

    private void finishPermissionRequest() {
        PluginCall call = pendingPermission;
        pendingPermission = null;
        if (call != null) call.resolve(statusResult(currentStatus()));
    }

    @PluginMethod
    public void listAssets(PluginCall call) {
        // JSONのミリ秒整数はLongになる。getDoubleはLongを受け付けないため使わない。
        Long fromMs = call.getLong("fromMs");
        Long toMs = call.getLong("toMs");
        Integer offset = call.getInt("offset");
        Integer limit = call.getInt("limit");
        if (fromMs == null || toMs == null || offset == null || limit == null
            || offset < 0 || limit <= 0 || limit > MAX_PAGE_SIZE || toMs <= fromMs) {
            call.reject("引数が不正です", "invalid-arguments");
            return;
        }
        if (!canRead()) {
            call.reject("写真へのアクセスが許可されていません", "permission-denied");
            return;
        }
        // 撮影日時(DATE_TAKEN)が無い画像は対象外。追加日・更新日では代用しない。
        PhotoListLoad pending = new PhotoListLoad(call);
        String queryId = UUID.randomUUID().toString();
        lists.put(queryId, pending);
        pending.task = new FutureTask<>(() -> {
        if (pending.finished.get()) return null;
        String taken = MediaStore.Images.Media.DATE_TAKEN;
        String selection = taken + " > 0 AND " + taken + " >= ? AND " + taken + " < ?";
        String[] args = {String.valueOf(fromMs.longValue()), String.valueOf(toMs.longValue())};
        String order = taken + " ASC, " + MediaStore.Images.Media._ID + " ASC";
        String[] projection = {MediaStore.Images.Media._ID, taken};
        ContentResolver resolver = getContext().getContentResolver();
        // 次ページの有無を知るため1件多く取る。
        try (Cursor cursor = queryPage(resolver, projection, selection, args, order, offset, limit + 1, pending.signal)) {
            if (cursor == null) {
                pending.rejectUnavailable();
                return null;
            }
            JSArray assets = new JSArray();
            boolean hasMore = false;
            while (!pending.finished.get() && cursor.moveToNext()) {
                if (assets.length() >= limit) {
                    hasMore = true;
                    break;
                }
                JSObject asset = new JSObject();
                asset.put("id", String.valueOf(cursor.getLong(0)));
                asset.put("createdMs", cursor.getLong(1));
                assets.put(asset);
            }
            JSObject result = new JSObject();
            result.put("assets", assets);
            result.put("hasMore", hasMore);
            if (pending.finished.compareAndSet(false, true)) {
                if (canRead()) call.resolve(result);
                else call.reject("写真へのアクセスが許可されていません", "permission-denied");
            }
        } catch (RuntimeException error) {
            pending.rejectUnavailable();
        } finally {
            lists.remove(queryId, pending);
        }
        return null;
        });
        try {
            queryExecutor.execute(pending.task);
        } catch (java.util.concurrent.RejectedExecutionException error) {
            lists.remove(queryId, pending);
            pending.cancel();
        }
    }

    private static Cursor queryPage(
        ContentResolver resolver, String[] projection, String selection, String[] args,
        String order, int offset, int limit, CancellationSignal signal) {
        Uri uri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        if (Build.VERSION.SDK_INT >= 26) {
            Bundle query = new Bundle();
            query.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection);
            query.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args);
            query.putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, order);
            query.putInt(ContentResolver.QUERY_ARG_LIMIT, limit);
            query.putInt(ContentResolver.QUERY_ARG_OFFSET, offset);
            return resolver.query(uri, projection, query, signal);
        }
        // 8.0 未満は並び順の末尾に LIMIT/OFFSET を付ける(値は検証済みの整数のみ)。
        return resolver.query(uri, projection, selection, args, order + " LIMIT " + limit + " OFFSET " + offset, signal);
    }

    @PluginMethod
    public void loadImage(PluginCall call) {
        String id = call.getString("id");
        Integer maxSide = call.getInt("maxSide");
        if (!isValidMediaId(id) || maxSide == null || maxSide <= 0 || maxSide > MAX_IMAGE_SIDE) {
            call.reject("引数が不正です", "invalid-arguments");
            return;
        }
        if (!canRead()) {
            call.reject("写真へのアクセスが許可されていません", "permission-denied");
            return;
        }
        // allowNetwork は Android では使わない(MediaStore はクラウド上の写真を取りに行かない)。
        String key = call.getString("requestId", loadKey(id, maxSide));
        ImageLoad load = new ImageLoad(call);
        ImageLoad previous = loads.put(key, load);
        if (previous != null) previous.cancel();
        load.task = new FutureTask<>(() -> {
            Bitmap bitmap = null;
            try {
                // 待機中に取り消された読込は OS に頼まない。
                if (load.finished.get()) return null;
                Uri uri = ContentUris.withAppendedId(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
                bitmap = decode(uri, maxSide);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (load.finished.get()) {
                    return null;
                } else if (bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)) {
                    JSObject result = new JSObject();
                    result.put("dataUrl", "data:image/jpeg;base64,"
                        + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                    if (load.finished.compareAndSet(false, true)) call.resolve(result);
                } else {
                    load.rejectUnavailable();
                }
            } catch (IOException | RuntimeException | OutOfMemoryError error) {
                load.rejectUnavailable();
            } finally {
                if (bitmap != null) bitmap.recycle();
                loads.remove(key, load);
            }
            return null;
        });
        if (load.finished.get()) load.task.cancel(true);
        try {
            executor.execute(load.task);
        } catch (java.util.concurrent.RejectedExecutionException error) {
            loads.remove(key, load);
            load.cancel();
        }
    }

    /** 縮小して復号する(原寸は復号しない)。向きは EXIF に合わせる。 */
    private Bitmap decode(Uri uri, int maxSide) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        if (Build.VERSION.SDK_INT >= 28) {
            // ImageDecoder は縮小しながら復号し、EXIF の向きも反映する。
            return ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri), (decoder, info, source) -> {
                int[] size = fitWithin(info.getSize().getWidth(), info.getSize().getHeight(), maxSide);
                decoder.setTargetSize(size[0], size[1]);
                decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
            });
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = resolver.openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IOException("画像の寸法を取得できません");
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxSide);
        Bitmap sampled;
        try (InputStream in = resolver.openInputStream(uri)) {
            sampled = BitmapFactory.decodeStream(in, null, options);
        }
        if (sampled == null) throw new IOException("decode failed");
        int[] size = fitWithin(sampled.getWidth(), sampled.getHeight(), maxSide);
        Matrix matrix = new Matrix();
        matrix.postScale((float) size[0] / sampled.getWidth(), (float) size[1] / sampled.getHeight());
        applyExifTransform(matrix, resolver, uri);
        Bitmap result = Bitmap.createBitmap(sampled, 0, 0, sampled.getWidth(), sampled.getHeight(), matrix, true);
        if (result != sampled) sampled.recycle();
        return result;
    }

    private static void applyExifTransform(Matrix matrix, ContentResolver resolver, Uri uri) {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) return;
            int orientation = new ExifInterface(in).getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL: matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_180: matrix.postRotate(180); break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL: matrix.postScale(1, -1); break;
                case ExifInterface.ORIENTATION_TRANSPOSE: matrix.postRotate(90); matrix.postScale(-1, 1); break;
                case ExifInterface.ORIENTATION_ROTATE_90: matrix.postRotate(90); break;
                case ExifInterface.ORIENTATION_TRANSVERSE: matrix.postRotate(90); matrix.postScale(1, -1); break;
                case ExifInterface.ORIENTATION_ROTATE_270: matrix.postRotate(270); break;
                default: break;
            }
        } catch (IOException | RuntimeException error) {
            // 向きが読めない画像は、縮小した画素の向きのまま表示する。
        }
    }

    private static String loadKey(String id, int maxSide) {
        return id + "|" + maxSide;
    }

    @PluginMethod
    public void cancelLoad(PluginCall call) {
        String id = call.getString("id");
        Integer maxSide = call.getInt("maxSide");
        if (id != null && maxSide != null) {
            ImageLoad load = loads.remove(call.getString("requestId", loadKey(id, maxSide)));
            if (load != null) load.cancel();
        }
        call.resolve();
    }

    /** 実行中・待機中の読込をすべて取り消す(画面退出・背面化・日付変更・機能OFF)。 */
    @PluginMethod
    public void cancelLoads(PluginCall call) {
        cancelAll();
        call.resolve();
    }

    private void cancelAll() {
        for (PhotoListLoad list : lists.values()) list.cancel();
        lists.clear();
        for (ImageLoad load : loads.values()) load.cancel();
        loads.clear();
    }

    /** 一覧要求も一度だけ完了させ、OSへ中断を伝え、待機分は取り除く。 */
    private final class PhotoListLoad {
        final PluginCall call;
        final CancellationSignal signal = new CancellationSignal();
        final AtomicBoolean finished = new AtomicBoolean(false);
        volatile FutureTask<Void> task;
        PhotoListLoad(PluginCall call) { this.call = call; }
        void cancel() {
            if (finished.compareAndSet(false, true)) call.reject("取り消されました", "cancelled");
            signal.cancel();
            FutureTask<Void> pending = task;
            if (pending != null) { pending.cancel(true); queryExecutor.remove(pending); }
        }
        void rejectUnavailable() {
            if (finished.compareAndSet(false, true)) call.reject("写真の一覧を取得できませんでした", "unavailable");
        }
    }

    /** JSの完了は一度だけ。取消時は通知待ちにせず、待機タスクもキューから外す。 */
    private final class ImageLoad {
        final PluginCall call;
        final AtomicBoolean finished = new AtomicBoolean(false);
        volatile FutureTask<Void> task;
        ImageLoad(PluginCall call) { this.call = call; }
        void cancel() {
            if (finished.compareAndSet(false, true)) call.reject("取り消されました", "cancelled");
            FutureTask<Void> pending = task;
            if (pending != null) {
                pending.cancel(true);
                executor.remove(pending);
            }
        }
        void rejectUnavailable() {
            if (finished.compareAndSet(false, true)) call.reject("OSがこの画像を提供できませんでした", "unavailable");
        }
    }

    @Override
    protected void handleOnDestroy() {
        cancelAll();
        executor.shutdownNow();
        queryExecutor.shutdownNow();
        PluginCall call = pendingPermission;
        pendingPermission = null;
        if (call != null) call.reject("権限の確認を中断しました", "cancelled");
    }
}
