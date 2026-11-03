import SwiftUI
import WidgetKit

struct WidgetThemeColors {
    let background: Color
    let primary: Color
    let secondary: Color
    let accent: Color
    let today: Color
    let todayText: Color

    init(scheme: ColorScheme) {
        let saved = WidgetAppearanceData.read()
        let requestedTheme = saved?.theme ?? "system"
        let theme = ["light", "dark", "system", "sakura", "leaf", "ocean", "lavender"].contains(requestedTheme) ? requestedTheme : "system"
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

/** 壁紙のぼかしに依存せず、薄い色面・斜めの反射・縁でガラス感を出す。 */
struct WidgetGlassSurface: View {
    let colors: WidgetThemeColors
    var body: some View {
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(colors.background.opacity(0.94))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [.white.opacity(0.14), .clear, colors.accent.opacity(0.05)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(LinearGradient(colors: [.white.opacity(0.62), colors.accent.opacity(0.22)],
                                                 startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
            )
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
                            .font(.caption.bold())
                            .fixedSize()
                        Text(event.calendarName)
                            .font(.caption)
                            .lineLimit(1)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .foregroundColor(colors.primary)
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
