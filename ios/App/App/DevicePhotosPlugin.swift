import Foundation
import Capacitor
import Photos
import UIKit

/// 端末の写真を撮影日時の範囲で読み取る(PhotoKit)。読み取り専用で、写真・識別子・日時をアプリ外へ出さない。
@objc(DevicePhotosPlugin)
public class DevicePhotosPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DevicePhotosPlugin"
    public let jsName = "DevicePhotos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listAssets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelLoad", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelLoads", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageLimitedAccess", returnType: CAPPluginReturnPromise)
    ]

    private static let maxPageSize = 100
    private static let maxImageSide = 1600
    private let manager = PHImageManager.default()
    // 登録・完了・取消はメインキューで直列化し、同じ画像も要求ごとに区別する。
    private var requests: [UUID: ImageLoad] = [:]
    private var lists: [UUID: PhotoListLoad] = [:]

    private func statusString(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "granted"
        case .limited: return "limited"
        case .notDetermined: return "prompt"
        default: return "denied"
        }
    }

    private func currentStatus() -> PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    private func canRead() -> Bool {
        let status = currentStatus()
        return status == .authorized || status == .limited
    }

    @objc func checkPermission(_ call: CAPPluginCall) {
        call.resolve(["status": statusString(currentStatus())])
    }

    /// 利用者が写真欄で操作した時だけ JS から呼ばれる。
    @objc func requestPermission(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            call.resolve(["status": self.statusString(status)])
        }
    }

    @objc func listAssets(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.startList(call) }
    }

    private func startList(_ call: CAPPluginCall) {
        guard let fromMs = call.getDouble("fromMs"),
              let toMs = call.getDouble("toMs"),
              let offset = call.getInt("offset"),
              let limit = call.getInt("limit"),
              fromMs.isFinite, toMs.isFinite,
              offset >= 0, limit > 0, limit <= DevicePhotosPlugin.maxPageSize,
              offset <= Int.max - limit, toMs > fromMs else {
            call.reject("引数が不正です。", "invalid-arguments")
            return
        }
        guard canRead() else {
            call.reject("写真へのアクセスが許可されていません。", "permission-denied")
            return
        }
        let token = UUID()
        let pending = PhotoListLoad(call: call)
        lists[token] = pending
        DispatchQueue.global(qos: .userInitiated).async {
            if pending.isCancelled { return }
            let options = PHFetchOptions()
            // 作成(撮影)日時が無い画像は対象外。追加日・更新日では代用しない。
            options.predicate = NSPredicate(
                format: "creationDate != nil AND creationDate >= %@ AND creationDate < %@",
                Date(timeIntervalSince1970: fromMs / 1000) as NSDate,
                Date(timeIntervalSince1970: toMs / 1000) as NSDate
            )
            options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
            // OS が非表示にした画像・最近削除した項目は取得しない。
            options.includeHiddenAssets = false
            let result = PHAsset.fetchAssets(with: .image, options: options)
            let total = result.count
            var assets: [[String: Any]] = []
            var index = offset
            while !pending.isCancelled && index < min(total, offset + limit) {
                let asset = result.object(at: index)
                if let created = asset.creationDate {
                    assets.append([
                        "id": asset.localIdentifier,
                        "createdMs": Int64((created.timeIntervalSince1970 * 1000).rounded(.down))
                    ])
                }
                index += 1
            }
            DispatchQueue.main.async {
                guard self.lists.removeValue(forKey: token) != nil, !pending.isCancelled else { return }
                guard self.canRead() else {
                    call.reject("写真へのアクセスが許可されていません。", "permission-denied")
                    return
                }
                call.resolve(["assets": assets, "hasMore": offset + limit < total])
            }
        }
    }

    @objc func loadImage(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.startLoad(call) }
    }

    private func startLoad(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let maxSide = call.getInt("maxSide"),
              maxSide > 0, maxSide <= DevicePhotosPlugin.maxImageSide else {
            call.reject("引数が不正です。", "invalid-arguments")
            return
        }
        guard canRead() else {
            call.reject("写真へのアクセスが許可されていません。", "permission-denied")
            return
        }
        // 一覧では false。利用者が個別に開いた時だけ true(iCloud 等からの取得を OS に任せる)。
        let allowNetwork = call.getBool("allowNetwork", false)
        guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject,
              asset.mediaType == .image, !asset.isHidden, asset.creationDate != nil else {
            call.reject("画像が見つかりません。", "not-found")
            return
        }
        let key = requestKey(id: id, maxSide: maxSide)
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = allowNetwork
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isSynchronous = false
        // 縮小した画像だけを要求する(原寸は復号しない)。
        let target = CGSize(width: maxSide, height: maxSide)
        let token = UUID()
        let pending = ImageLoad(key: key, requestId: call.getString("requestId") ?? key, call: call)
        requests[token] = pending
        let requestID = manager.requestImage(
            for: asset, targetSize: target, contentMode: .aspectFit, options: options
        ) { [weak self] image, info in
            if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
            DispatchQueue.main.async {
                // 取消済み・完了済みのコールバックは、新しい同一画像の要求に触れない。
                guard let self = self, self.requests.removeValue(forKey: token) != nil else { return }
                if (info?[PHImageCancelledKey] as? Bool) == true {
                    call.reject("取り消されました。", "cancelled")
                    return
                }
                guard self.canRead(), !asset.isHidden,
                      let image = image,
                      let data = DevicePhotosPlugin.jpeg(image, maxSide: CGFloat(maxSide)) else {
                    call.reject("OSがこの画像を提供できませんでした。", "unavailable")
                    return
                }
                call.resolve(["dataUrl": "data:image/jpeg;base64," + data.base64EncodedString()])
            }
        }
        pending.requestID = requestID
    }

    @objc func cancelLoad(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let id = call.getString("id"), let maxSide = call.getInt("maxSide") {
                let key = self.requestKey(id: id, maxSide: maxSide)
                if let requestId = call.getString("requestId") {
                    self.cancelRequests { $0.key == key && $0.requestId == requestId }
                } else { self.cancelRequests { $0.key == key } }
            }
            call.resolve()
        }
    }

    /// 実行中の画像要求をすべて取り消す(画面退出・背面化・日付変更・機能OFF)。
    @objc func cancelLoads(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let pending = Array(self.lists.values)
            self.lists.removeAll()
            for list in pending {
                list.cancel()
                list.call.reject("取り消されました。", "cancelled")
            }
            self.cancelRequests { _ in true }
            call.resolve()
        }
    }

    /// 一部許可のとき、OS の選択画面で見せる写真を選び直す。
    @objc func manageLimitedAccess(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let status = self.currentStatus()
            guard status == .limited, let presenter = self.bridge?.viewController else {
                call.resolve(["status": self.statusString(status)])
                return
            }
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: presenter) { _ in
                call.resolve(["status": self.statusString(self.currentStatus())])
            }
        }
    }

    private func requestKey(id: String, maxSide: Int) -> String {
        "\(id)|\(maxSide)"
    }

    private func cancelRequests(where shouldCancel: (ImageLoad) -> Bool) {
        let pending = requests.filter { shouldCancel($0.value) }
        for (token, load) in pending {
            requests.removeValue(forKey: token)
            if load.requestID != PHInvalidImageRequestID { manager.cancelImageRequest(load.requestID) }
            // PhotoKitの取消通知を待たずにJS側の同時生成枠も必ず解放する。
            load.call.reject("取り消されました。", "cancelled")
        }
    }

    /// OS が返した画像が指定より大きければ長辺 maxSide 以下へ縮め、JPEG にする(ディスクへは書かない)。
    private static func jpeg(_ image: UIImage, maxSide: CGFloat) -> Data? {
        let longest = max(image.size.width, image.size.height) * image.scale
        guard longest > maxSide else { return image.jpegData(compressionQuality: 0.8) }
        let ratio = maxSide / longest
        let size = CGSize(
            width: max(1, (image.size.width * image.scale * ratio).rounded(.down)),
            height: max(1, (image.size.height * image.scale * ratio).rounded(.down))
        )
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }
}

/// メインキューでだけ読み書きする要求単位の状態。
private final class ImageLoad {
    let key: String
    let requestId: String
    let call: CAPPluginCall
    var requestID: PHImageRequestID = PHInvalidImageRequestID
    init(key: String, requestId: String, call: CAPPluginCall) {
        self.key = key
        self.requestId = requestId
        self.call = call
    }
}

/// PhotoKitの同期検索そのものは強制中断できないため、失効印で列挙と返却を止める。
private final class PhotoListLoad {
    let call: CAPPluginCall
    private let lock = NSLock()
    private var cancelled = false
    init(call: CAPPluginCall) { self.call = call }
    var isCancelled: Bool {
        lock.lock()
        defer { lock.unlock() }
        return cancelled
    }
    func cancel() {
        lock.lock()
        cancelled = true
        lock.unlock()
    }
}
