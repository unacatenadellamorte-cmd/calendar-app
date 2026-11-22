import SwiftUI
import WidgetKit

struct WidgetThemeColors {
    let background: Color
    let primary: Color
    let secondary: Color
    let accent: Color
    let today: Color
    let todayText: Color
    /// テーマ「ガラス」。透明寄りの面と反射で描く(iOS実機/Xcode未検証)。
    let glass: Bool
    /// ガラス面の透過度(0=不透明、1=面が透明)。文字・予定・縁には適用しない。
    let glassTransparency: Double
    /// 屈折の強さ(0〜1)。WidgetKitはホーム壁紙を曲げられないため、縁の厚み・反射・色分散に使う。
    let glassRefraction: Double

    init(scheme: ColorScheme) {
        let saved = WidgetAppearanceData.read()
        let requestedTheme = saved?.theme ?? "system"
        let theme = ["light", "dark", "system", "sakura", "leaf", "ocean", "lavender", "glass"].contains(requestedTheme) ? requestedTheme : "system"
        glass = theme == "glass"
        glassTransparency = saved?.glassTransparency ?? WidgetAppearanceData.defaultGlassTransparency
        glassRefraction = saved?.glassRefraction ?? WidgetAppearanceData.defaultGlassRefraction
        let dark = theme == "dark" || (theme == "system" && scheme == .dark)
        // 端末追従は、アプリを開いていない間の外観変更にも追従させる。
        let custom = theme == "system" ? nil : saved
        func rgb(_ key: KeyPath<WidgetAppearanceData, String?>, _ light: UInt32, _ night: UInt32) -> UInt32 {
            custom?.rgb(key, fallback: dark ? night : light) ?? (dark ? night : light)
        }
        func color(_ value: UInt32) -> Color {
            Color(red: Double((value >> 16) & 255) / 255,
                  green: Double((value >> 8) & 255) / 255,
                  blue: Double(value & 255) / 255)
        }
        let base = rgb(\.backgroundColor, 0xffffff, 0x0f1b31)
        let accentRGB = rgb(\.accentColor, 0x2563eb, 0x5cc4e6)
        func tintChannel(_ shift: UInt32) -> Double {
            (Double((base >> shift) & 255) * 0.92 + Double((accentRGB >> shift) & 255) * 0.08) / 255
        }
        background = Color(red: tintChannel(16), green: tintChannel(8), blue: tintChannel(0))
        primary = color(rgb(\.primaryTextColor, 0x1a1c1e, 0xe9f0fa))
        secondary = color(rgb(\.secondaryTextColor, 0x585f68, 0xa3b4cc))
        accent = color(accentRGB)
        today = color(rgb(\.todayColor, 0xeaf1ff, 0x123350))
        todayText = color(rgb(\.todayTextColor, 0x2563eb, 0x5cc4e6))
    }
}

/**
 * 壁紙のぼかし・屈折に依存せず(WidgetKitは壁紙を取得・加工できない)、薄い色面・散乱光・斜めの反射・
 * 屈折の強さに連動する厚い縁と色分散でガラス感を出す。描画は更新時の一度だけで常時アニメーションなし。
 */
struct WidgetGlassSurface: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let colors: WidgetThemeColors
    var body: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(colors.background.opacity(faceOpacity))
            .overlay(frostVeil)
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [.white.opacity(glassActive ? optics.sheen : 0.14), .clear, colors.accent.opacity(0.05)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(stops: [.init(color: .clear, location: 0.55),
                                                 .init(color: .black.opacity(bottomShade), location: 1)],
                                         startPoint: .top, endPoint: .bottom))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(LinearGradient(colors: colors.glass ? [.white.opacity(optics.rim), .white.opacity(optics.rim * 0.55), .white.opacity(optics.rim * 0.95)]
                                                          : [.white.opacity(0.62), colors.accent.opacity(0.22)],
                                                 startPoint: colors.glass ? .topTrailing : .topLeading,
                                                 endPoint: colors.glass ? .bottomLeading : .bottomTrailing), lineWidth: colors.glass ? optics.rimWidth : 1)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.22), .clear, colors.accent.opacity(0.16)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 0.7)
                    .padding(2)
            )
            .overlay(glassRim)
            .overlay(dispersion)
    }

    private var glassActive: Bool { colors.glass && !reduceTransparency }
    private var optics: WidgetGlassOptics { WidgetGlassOptics(transparency: colors.glassTransparency, refraction: colors.glassRefraction) }

    /// 透過度を減らす設定では不透明。ガラス以外は従来値を保つ。
    private var faceOpacity: Double {
        if reduceTransparency { return 1 }
        guard colors.glass else { return 0.96 }
        return 1 - min(max(colors.glassTransparency, 0), 1)
    }

    /// 透明になるほど下側の陰影を弱め、壁紙を濁さない。
    private var bottomShade: Double {
        colors.glass && !reduceTransparency ? 0.10 * (1 - 0.6 * min(max(colors.glassTransparency, 0), 1)) : 0.10
    }

    /** すりガラスの散乱光(マット側ほど強い淡い白)。壁紙そのものはぼかせない。 */
    @ViewBuilder
    private var frostVeil: some View {
        if glassActive && optics.frostVeil > 0.005 {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(RadialGradient(colors: [.white.opacity(optics.frostVeil), .white.opacity(optics.frostVeil * 0.55)],
                                     center: UnitPoint(x: 0.42, y: 0.38), startRadius: 0, endRadius: 260))
                .allowsHitTesting(false)
        }
    }

    /** ガラスの厚い縁の内側に、屈折で色が分かれたような細い線を重ねる(物理屈折ではない近似)。 */
    @ViewBuilder
    private var glassRim: some View {
        if glassActive {
            let inset = optics.rimWidth + 0.8
            RoundedRectangle(cornerRadius: max(22 - inset, 0), style: .continuous)
                .strokeBorder(Color(red: 0.56, green: 0.85, blue: 1).opacity(0.18 + 0.3 * optics.refraction), lineWidth: 1.1)
                .padding(inset)
                .overlay(
                    RoundedRectangle(cornerRadius: max(22 - inset - 1.2, 0), style: .continuous)
                        .strokeBorder(Color(red: 1, green: 0.69, blue: 0.88).opacity(0.1 + 0.16 * optics.refraction), lineWidth: 1)
                        .padding(inset + 1.2)
                )
                .allowsHitTesting(false)
        }
    }

    /** 上下の縁に沿う色分散(赤→黄→緑→青)。屈折の強さ0では描かない。 */
    @ViewBuilder
    private var dispersion: some View {
        if glassActive && optics.dispersion > 0.01 {
            let a = optics.dispersion
            let band = LinearGradient(colors: [.clear, Color(red: 1, green: 0.42, blue: 0.42).opacity(a), Color(red: 1, green: 0.85, blue: 0.29).opacity(a),
                                               Color(red: 0.36, green: 0.89, blue: 0.63).opacity(a * 0.9), Color(red: 0.42, green: 0.72, blue: 1).opacity(a * 0.75), .clear],
                                      startPoint: .leading, endPoint: .trailing)
            GeometryReader { proxy in
                let w = proxy.size.width, h = proxy.size.height
                let y = optics.rimWidth + 0.6, line = 0.8 + 0.6 * optics.refraction
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(band).frame(width: w * 0.28, height: line).offset(x: w * 0.42, y: y)
                    Rectangle().fill(band).frame(width: w * 0.28, height: line).offset(x: w * 0.18, y: h - y - line)
                }
            }
            .allowsHitTesting(false)
        }
    }
}

/** ウィジェットのガラスの強さ。Android(WidgetGlass.kt の widgetGlassOptics)と同じ式。 */
struct WidgetGlassOptics: Equatable {
    let refraction: Double
    let rimWidth: Double
    let rim: Double
    let sheen: Double
    let dispersion: Double
    let frostVeil: Double

    init(transparency: Double, refraction rawRefraction: Double) {
        let r = rawRefraction.isFinite ? min(max(rawRefraction, 0), 1) : WidgetAppearanceData.defaultGlassRefraction
        let frost = 1 - (transparency.isFinite ? min(max(transparency, 0), 1) : WidgetAppearanceData.defaultGlassTransparency)
        refraction = r
        rimWidth = 1.6 + 2 * r
        rim = 0.72 + 0.26 * r
        sheen = 0.30 + 0.28 * r
        dispersion = 0.48 * r
        frostVeil = 0.22 * frost
    }
}

extension View {
    /** 更新箇所だけ短く切り替え、動きを減らす設定ではOSの暗黙アニメーションも止める。 */
    @ViewBuilder
    func widgetUpdate<Value: Equatable>(_ value: Value, reduceMotion: Bool) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            self.contentTransition(.opacity)
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: value)
                .transaction { transaction in
                    if reduceMotion { transaction.animation = nil; transaction.disablesAnimations = true }
                }
        } else {
            self
        }
    }
}

struct FeaturedWidgetEntry: TimelineEntry {
    let date: Date
    let events: [FeaturedWidgetEvent]
}

struct FeaturedEventsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FeaturedWidgetEntry {
        FeaturedWidgetEntry(date: Date(), events: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (FeaturedWidgetEntry) -> Void) {
        completion(FeaturedWidgetEntry(date: Date(), events: FeaturedWidgetData.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FeaturedWidgetEntry>) -> Void) {
        let now = Date()
        let entry = FeaturedWidgetEntry(date: now, events: FeaturedWidgetData.read())
        // 最新データの選抜・書込みはアプリ側。OS更新は保存済みスナップショットを再読込するだけ。
        completion(Timeline(entries: [entry], policy: .after(now.addingTimeInterval(15 * 60))))
    }
}

struct FeaturedEventsWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let entry: FeaturedWidgetEntry
    private var colors: WidgetThemeColors { WidgetThemeColors(scheme: colorScheme) }

    private var rowLimit: Int {
        switch family {
        case .systemSmall: return 1
        case .systemMedium: return 2
        default: return 3
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            if entry.events.isEmpty {
                Text(FeaturedWidgetData.emptyMessage)
                    .font(.subheadline)
                    .foregroundColor(colors.secondary)
            } else {
                // 配列順が優先順位。ID重複があってもSwiftUIの行識別を壊さない。
                ForEach(Array(entry.events.prefix(rowLimit).enumerated()), id: \.offset) { _, event in
                    HStack(spacing: 8) {
                        let rgb = FeaturedWidgetData.colorRGB(event.colorHex)
                        RoundedRectangle(cornerRadius: 2)
                            .fill(Color(red: Double((rgb >> 16) & 255) / 255,
                                        green: Double((rgb >> 8) & 255) / 255,
                                        blue: Double(rgb & 255) / 255))
                            .frame(width: 4, height: 24)
                            .accessibilityHidden(true)
                        Text(FeaturedWidgetData.startLabel(event))
                            .font(.footnote.bold())
                            .lineLimit(2)
                            .widgetUpdate(FeaturedWidgetData.startLabel(event), reduceMotion: reduceMotion)
                        Text(event.calendarName)
                            .font(.footnote)
                            .lineLimit(1)
                    }
                    .padding(.leading, 11)
                    .padding(.trailing, 8)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(colors.today.opacity(0.65), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .widgetUpdate(event, reduceMotion: reduceMotion)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .foregroundColor(colors.primary)
        .transaction { transaction in
            if reduceMotion { transaction.animation = nil; transaction.disablesAnimations = true }
        }
        .widgetURL(FeaturedWidgetData.deepLink(entry.events.first, now: entry.date))
    }

    var body: some View {
        // iOS 15を維持しつつ、iOS 17以降で背景未設定の警告表示になるのを防ぐ。
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { WidgetGlassSurface(colors: colors) }
        } else {
            content.padding().background(WidgetGlassSurface(colors: colors))
        }
    }
}

struct FeaturedEventsWidget: Widget {
    let kind = "FeaturedEventsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FeaturedEventsProvider()) { entry in
            FeaturedEventsWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Multi calendar")
        .description("優先度の高い予定を最大3件表示します。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
