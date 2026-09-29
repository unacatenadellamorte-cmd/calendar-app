import Foundation
import UIKit
import Capacitor
import GoogleMobileAds

/// DOM枠だけに表示する。全操作とSDKコールバックはメインキュー上で扱う。
class BannerExecutor: NSObject, BannerViewDelegate {
    weak var plugin: AdMobPlugin?
    private var bannerView: BannerView?
    private var requestId = 0
    private var loaded = false
    private var placement: (requestId: Int, rect: CGRect, visible: Bool)?
    private var lifecycleObservers: [NSObjectProtocol] = []
    private var applicationActive = false

    deinit {
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    private func observeLifecycle(for banner: BannerView) {
        applicationActive = UIApplication.shared.applicationState == .active
        let center = NotificationCenter.default
        lifecycleObservers = [
            center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self, weak banner] _ in
                guard let self = self, let banner = banner, self.bannerView === banner else { return }
                self.applicationActive = false
                banner.isHidden = true
            },
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self, weak banner] _ in
                guard let self = self, let banner = banner, self.bannerView === banner else { return }
                self.applicationActive = true
                // 復帰前にJSが配置成功を記録していても、アクティブになってから再適用する。
                self.applyPlacement()
            }
        ]
    }

    private func applyPlacement() {
        guard let banner = bannerView else { return }
        banner.isHidden = true
        guard let placement = placement, placement.requestId == requestId,
              let root = plugin?.bridge?.viewController,
              let webView = plugin?.bridge?.webView else { return }
        // 復帰中の回転やレイアウト変更も現在のWebView座標で検証する。
        banner.frame = webView.convert(placement.rect, to: root.view)
        let contained = webView.bounds.contains(placement.rect) && root.view.bounds.contains(banner.frame)
        banner.isHidden = !(placement.visible && loaded && contained && applicationActive &&
                            UIApplication.shared.applicationState == .active)
    }

    func showBanner(_ call: CAPPluginCall, _ request: Request, _ adUnitID: String) {
        guard let root = plugin?.bridge?.viewController,
              let webView = plugin?.bridge?.webView else {
            call.reject("広告を配置するWebViewが見つからない")
            return
        }
        let width = call.getDouble("width") ?? 0
        guard width.isFinite, width > 0, bannerView == nil,
              let nextId = call.getInt("requestId"), nextId > 0 else {
            call.reject("広告幅か要求識別子が不正、または旧広告が未削除")
            return
        }
        let size = currentOrientationAnchoredAdaptiveBanner(width: CGFloat(width))
        guard size.size.width > 0, size.size.height > 0 else {
            call.reject("広告サイズを決定できない")
            return
        }
        let banner = BannerView(adSize: size)
        requestId = nextId
        loaded = false
        bannerView = banner
        banner.adUnitID = adUnitID
        banner.rootViewController = root
        banner.delegate = self
        banner.translatesAutoresizingMaskIntoConstraints = true
        // ロード完了だけでは表示せず、JSの枠確保と位置確認を待つ。
        banner.isHidden = true
        root.view.addSubview(banner)
        let rect = CGRect(x: call.getDouble("left") ?? 0, y: call.getDouble("margin") ?? 0,
                          width: Double(size.size.width), height: Double(size.size.height))
        banner.frame = webView.convert(rect, to: root.view)
        observeLifecycle(for: banner)
        banner.paidEventHandler = { [weak self, weak banner] adValue in
            guard let self = self, let banner = banner, self.bannerView === banner else { return }
            self.plugin?.notifyListeners(BannerAdPluginEvents.AdPaid.rawValue, data: [
                "adUnitId": banner.adUnitID ?? "",
                "valueMicros": adValue.value.multiplying(by: NSDecimalNumber(value: 1_000_000)).int64Value,
                "currencyCode": adValue.currencyCode,
                "precision": adValue.precision.rawValue,
                "networkName": banner.responseInfo?.loadedAdNetworkResponseInfo?.adNetworkClassName ?? "",
                "impressionId": banner.responseInfo?.responseIdentifier ?? "",
                "requestId": self.requestId
            ])
        }
        banner.load(request)
        call.resolve()
    }

    func updateBannerPlacement(_ call: CAPPluginCall) {
        guard let banner = bannerView, call.getInt("requestId") == requestId else {
            // 古い要求は新しい広告へ一切触れない。
            call.resolve()
            return
        }
        // 座標変換に失敗しても、以前の位置に広告を残さない。
        banner.isHidden = true
        placement = nil
        guard plugin?.bridge?.viewController != nil,
              plugin?.bridge?.webView != nil else {
            call.reject("広告を配置するWebViewが見つからない")
            return
        }
        let left = call.getDouble("left") ?? 0
        let top = call.getDouble("margin") ?? 0
        guard left.isFinite, top.isFinite else {
            call.reject("広告座標が不正")
            return
        }
        let rect = CGRect(x: left, y: top, width: Double(banner.adSize.size.width),
                          height: Double(banner.adSize.size.height))
        // CSSの安全領域を含むWebView座標を親ビューへ変換する。safeAreaInsetsは足さない。
        placement = (requestId, rect, call.getBool("visible") == true)
        applyPlacement()
        call.resolve()
    }

    func hideBanner(_ call: CAPPluginCall) {
        placement = nil
        bannerView?.isHidden = true
        call.resolve()
    }

    func resumeBanner(_ call: CAPPluginCall) {
        call.reject("updateBannerPlacementでDOM枠を確認して再表示すること")
    }

    func removeBanner(_ call: CAPPluginCall) {
        discardBanner()
        // デリゲートとビューの解除完了後に次の要求へ進める。
        call.resolve()
    }

    private func discardBanner() {
        placement = nil
        lifecycleObservers.forEach { NotificationCenter.default.removeObserver($0) }
        lifecycleObservers = []
        applicationActive = false
        let previous = bannerView
        bannerView = nil
        loaded = false
        previous?.isHidden = true
        previous?.delegate = nil
        previous?.paidEventHandler = nil
        previous?.removeFromSuperview()
    }

    func bannerViewDidReceiveAd(_ bannerView: BannerView) {
        guard self.bannerView === bannerView else { return }
        loaded = true
        plugin?.notifyListeners(BannerAdPluginEvents.SizeChanged.rawValue, data: [
            "width": bannerView.adSize.size.width,
            "height": bannerView.adSize.size.height,
            "requestId": requestId
        ])
        plugin?.notifyListeners(BannerAdPluginEvents.Loaded.rawValue, data: ["requestId": requestId])
    }

    func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) {
        guard self.bannerView === bannerView else { return }
        let failedId = requestId
        discardBanner()
        plugin?.notifyListeners(BannerAdPluginEvents.SizeChanged.rawValue, data: [
            "width": 0, "height": 0, "requestId": failedId
        ])
        plugin?.notifyListeners(BannerAdPluginEvents.FailedToLoad.rawValue, data: [
            "code": (error as NSError).code, "message": error.localizedDescription, "requestId": failedId
        ])
    }

    func bannerViewDidRecordImpression(_ bannerView: BannerView) {
        guard self.bannerView === bannerView else { return }
        plugin?.notifyListeners(BannerAdPluginEvents.AdImpression.rawValue, data: ["requestId": requestId])
    }

    func bannerViewWillPresentScreen(_ bannerView: BannerView) {
        guard self.bannerView === bannerView else { return }
        plugin?.notifyListeners(BannerAdPluginEvents.Opened.rawValue, data: ["requestId": requestId])
    }

    func bannerViewWillDismissScreen(_ bannerView: BannerView) {
        guard self.bannerView === bannerView else { return }
        plugin?.notifyListeners(BannerAdPluginEvents.Closed.rawValue, data: ["requestId": requestId])
    }
}
