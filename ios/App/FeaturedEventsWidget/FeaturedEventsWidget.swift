import SwiftUI
import WidgetKit

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
    let entry: FeaturedWidgetEntry

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
                    .foregroundColor(.secondary)
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
        .widgetURL(FeaturedWidgetData.deepLink(entry.events.first, now: entry.date))
    }

    var body: some View {
        // iOS 15を維持しつつ、iOS 17以降で背景未設定の警告表示になるのを防ぐ。
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
        } else {
            content.padding().background(Color(uiColor: .systemBackground))
        }
    }
}

struct FeaturedEventsWidget: Widget {
    let kind = "FeaturedEventsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FeaturedEventsProvider()) { entry in
            FeaturedEventsWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("マルチカレンダー")
        .description("優先度の高い予定を最大3件表示します。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
