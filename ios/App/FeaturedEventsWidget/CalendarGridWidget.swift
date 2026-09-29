import SwiftUI
import WidgetKit

struct CalendarGridEntry: TimelineEntry {
    let date: Date
    let payload: CalendarOverviewPayload?
}

struct CalendarGridProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalendarGridEntry {
        CalendarGridEntry(date: Date(), payload: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (CalendarGridEntry) -> Void) {
        completion(CalendarGridEntry(date: Date(), payload: CalendarGridData.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarGridEntry>) -> Void) {
        let now = Date()
        let entry = CalendarGridEntry(date: now, payload: CalendarGridData.read())
        completion(Timeline(entries: [entry], policy: .after(CalendarGridData.nextMidnight(after: now))))
    }
}

struct CalendarGridWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CalendarGridEntry

    private var isLarge: Bool { family == .systemLarge }

    private var days: [CalendarGridDay] {
        CalendarGridData.days(containing: entry.date, payload: entry.payload)
    }

    private var language: String { entry.payload?.language ?? "ja" }

    private var content: some View {
        GeometryReader { geometry in
            gridContent(availableHeight: geometry.size.height)
        }
    }

    private func gridContent(availableHeight: CGFloat) -> some View {
        let gridDays = days
        let rowSpacing: CGFloat = isLarge ? 3 : 1
        let rows = CGFloat(max(1, gridDays.count / 7))
        let cellHeight = max(0, (availableHeight - 20 - 12 - 4 - rowSpacing * rows) / rows)
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(CalendarGridData.monthTitle(entry.date, language: language))
                    .font(.system(size: 13, weight: .semibold))
                Spacer(minLength: 4)
                Link(destination: CalendarGridData.createLink(for: entry.date)) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .bold))
                        .accessibilityLabel(CalendarGridData.addEventLabel(language: language))
                }
            }
            .foregroundColor(.primary)
            .frame(height: 20)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: rowSpacing) {
                ForEach(CalendarGridData.weekdayLabels(language: language), id: \.self) { weekday in
                    Text(weekday)
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 12)
                }
                ForEach(gridDays, id: \.key) { day in
                    if let destination = CalendarGridData.deepLink(forDay: day.key) {
                        Link(destination: destination) {
                            dayCell(day, height: cellHeight)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func dayCell(_ day: CalendarGridDay, height: CGFloat) -> some View {
        let number = day.key.split(separator: "-").last.map(String.init) ?? ""
        VStack(alignment: .leading, spacing: 1) {
            if isLarge {
                HStack(spacing: 1) {
                    Text(number)
                        .font(.system(size: 9, weight: .bold))
                    Spacer(minLength: 0)
                    if day.events.count > 2 {
                        Text("+\(day.events.count - 2)").font(.system(size: 6, weight: .semibold))
                    }
                }
                .foregroundColor(day.isInDisplayedMonth ? (day.isToday ? .white : .primary) : .secondary)
                ForEach(Array(day.events.prefix(2)), id: \.id) { event in
                    HStack(spacing: 2) {
                        if !event.filledLabel { Rectangle().fill(dayColor(event)).frame(width: 2) }
                        Text(event.title)
                            .font(.system(size: 7))
                            .lineLimit(1)
                            .foregroundColor(.primary)
                    }
                    .padding(.horizontal, 2)
                    .background(dayColor(event).opacity(event.filledLabel ? 0.35 : 0))
                }
            } else {
                HStack(spacing: 2) {
                    Text(number)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(day.isInDisplayedMonth ? (day.isToday ? .white : .primary) : .secondary)
                    if let event = day.events.first {
                        Circle().fill(dayColor(event)).frame(width: 4, height: 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(2)
        .frame(maxWidth: .infinity)
        .frame(height: height, alignment: .topLeading)
        .background(day.isToday ? Color.accentColor : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }

    private func dayColor(_ event: CalendarOverviewEvent) -> Color {
        let rgb = FeaturedWidgetData.colorRGB(event.colorHex)
        return Color(red: Double((rgb >> 16) & 255) / 255,
                     green: Double((rgb >> 8) & 255) / 255,
                     blue: Double(rgb & 255) / 255)
    }

    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { Color(uiColor: .systemBackground) }
        } else {
            content.padding().background(Color(uiColor: .systemBackground))
        }
    }
}

struct CalendarGridWidget: Widget {
    let kind = "CalendarGridWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CalendarGridProvider()) { entry in
            CalendarGridWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("月カレンダー")
        .description("日付と予定を月グリッドで表示します。")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
