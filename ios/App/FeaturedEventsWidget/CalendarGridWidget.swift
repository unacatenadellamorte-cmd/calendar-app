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
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var colors: WidgetThemeColors { WidgetThemeColors(scheme: colorScheme) }
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
        .transaction { transaction in
            if reduceMotion { transaction.animation = nil; transaction.disablesAnimations = true }
        }
    }

    private func gridContent(availableHeight: CGFloat) -> some View {
        let gridDays = days
        let rowSpacing: CGFloat = isLarge ? 3 : 1
        let rows = CGFloat(max(1, gridDays.count / 7))
        let cellHeight = max(0, (availableHeight - 24 - 12 - 4 - rowSpacing * rows) / rows)
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(CalendarGridData.monthTitle(entry.date, language: language))
                    .font(.system(size: 13, weight: .semibold))
                    .widgetUpdate(CalendarGridData.monthTitle(entry.date, language: language), reduceMotion: reduceMotion)
                Spacer(minLength: 4)
                Link(destination: CalendarGridData.createLink(for: entry.date)) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(colors.accent)
                        .frame(width: 28, height: 24)
                        .background(colors.today, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .accessibilityLabel(CalendarGridData.addEventLabel(language: language))
                }
            }
            .foregroundColor(colors.primary)
            .frame(height: 24)

            HStack(spacing: 0) {
                ForEach(CalendarGridData.weekdayLabels(language: language), id: \.self) { weekday in
                    Text(weekday)
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(colors.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 12)
                }
            }
            VStack(spacing: rowSpacing) {
                ForEach(0..<Int(rows), id: \.self) { row in
                    weekRow(Array(gridDays.dropFirst(row * 7).prefix(7)), height: cellHeight)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func weekRow(_ week: [CalendarGridDay], height: CGFloat) -> some View {
        let pitch: CGFloat = isLarge ? 10 : 7
        let dateHeight: CGFloat = isLarge ? 13 : 9
        let capacity = min(4, max(0, Int((height - dateHeight - 2) / pitch)))
        let shown = week.map { Array($0.events.prefix(capacity)) }
        return ZStack(alignment: .topLeading) {
            Canvas { context, size in
                let width = size.width / 7
                for column in week.indices {
                    for (lane, event) in shown[column].enumerated() {
                        let top = 1 + dateHeight + CGFloat(lane) * pitch
                        if event.filledLabel {
                            let rect = CGRect(x: CGFloat(column) * width + 2, y: top, width: max(0, width - 4), height: pitch)
                            context.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(dayColor(event)))
                        }
                        guard column + 1 < week.count, !event.id.isEmpty,
                              let next = shown[column + 1].firstIndex(where: { $0.id == event.id }) else { continue }
                        let bridge = markerBridge(x: CGFloat(column + 1) * width, y: top + pitch / 2,
                                                  offset: CGFloat(next - lane) * pitch, half: pitch / 2, filled: event.filledLabel)
                        if event.filledLabel { context.fill(bridge, with: .color(dayColor(event))) }
                        else { context.stroke(bridge, with: .color(dayColor(event)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round)) }
                    }
                }
            }
            .accessibilityHidden(true)
            HStack(spacing: 0) {
                ForEach(Array(week.enumerated()), id: \.element.key) { column, day in
                    if let destination = CalendarGridData.deepLink(forDay: day.key) {
                        Link(destination: destination) {
                            dayCell(day, shown: shown, column: column, height: height, dateHeight: dateHeight, pitch: pitch)
                        }
                        .accessibilityLabel(day.key + " " + day.events.map(\.title).joined(separator: "、"))
                    }
                }
            }
        }.frame(height: height)
    }

    private func dayCell(_ day: CalendarGridDay, shown: [[CalendarOverviewEvent]], column: Int,
                         height: CGFloat, dateHeight: CGFloat, pitch: CGFloat) -> some View {
        let number = day.key.split(separator: "-").last.map(String.init) ?? ""
        return VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 1) {
                    Text(number)
                        .font(.system(size: isLarge ? 9 : 8, weight: .bold))
                    Spacer(minLength: 0)
                    if day.events.count > shown[column].count {
                        Text("+\(day.events.count - shown[column].count)").font(.system(size: 6, weight: .semibold))
                    }
                }
                .foregroundColor(day.isInDisplayedMonth ? (day.isToday ? colors.todayText : colors.primary) : colors.secondary)
                .frame(height: dateHeight)
                .background(day.isToday ? colors.today : .clear, in: RoundedRectangle(cornerRadius: 4))
                ForEach(Array(shown[column].enumerated()), id: \.offset) { _, event in
                    let range = CalendarGridData.displayRange(event)
                    let before = column > 0 && shown[column - 1].contains { $0.id == event.id }
                    let after = column + 1 < shown.count && shown[column + 1].contains { $0.id == event.id }
                    let title = (range.startDate < day.key && !before ? "←" : "") + event.title + (day.key < range.endDate && !after ? "→" : "")
                    HStack(spacing: 2) {
                        if !event.filledLabel { Rectangle().fill(dayColor(event)).frame(width: 2) }
                        Text(title)
                            .font(.system(size: isLarge ? 7 : 6))
                            .lineLimit(1)
                            .foregroundColor(event.filledLabel ? labelInk(event) : colors.primary)
                            .widgetUpdate(title, reduceMotion: reduceMotion)
                    }
                    .frame(height: pitch)
                    .padding(.horizontal, 1)
                }
        }
        .padding(.horizontal, 2)
        .padding(.top, 1)
        .frame(maxWidth: .infinity)
        .frame(height: height, alignment: .topLeading)
        .widgetUpdate(day.isToday, reduceMotion: reduceMotion)
    }

    private func labelInk(_ event: CalendarOverviewEvent) -> Color {
        let rgb = FeaturedWidgetData.colorRGB(event.colorHex)
        func linear(_ channel: UInt32) -> Double {
            let value = Double(channel) / 255
            return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        let luminance = 0.2126 * linear((rgb >> 16) & 255) + 0.7152 * linear((rgb >> 8) & 255) + 0.0722 * linear(rgb & 255)
        return luminance > 0.179 ? .black : .white
    }

    private func markerBridge(x: CGFloat, y: CGFloat, offset: CGFloat, half: CGFloat, filled: Bool) -> Path {
        let distance = abs(offset)
        var path = Path()
        if !filled {
            let bend = min(2, distance / 2)
            path.move(to: CGPoint(x: -6, y: 0))
            if distance == 0 { path.addLine(to: CGPoint(x: 6, y: 0)) }
            else {
                path.addLine(to: CGPoint(x: -bend, y: 0)); path.addQuadCurve(to: CGPoint(x: 0, y: bend), control: .zero)
                path.addLine(to: CGPoint(x: 0, y: distance - bend))
                path.addQuadCurve(to: CGPoint(x: bend, y: distance), control: CGPoint(x: 0, y: distance))
                path.addLine(to: CGPoint(x: 6, y: distance))
            }
        } else if distance == 0 { path.addRect(CGRect(x: -6, y: -half, width: 12, height: 2 * half)) }
        else {
            let outer = min(half, 4); let inner = min(1.5, half / 2)
            let left: CGFloat = -1.2; let right: CGFloat = 1.2
            path.move(to: CGPoint(x: -6, y: -half)); path.addLine(to: CGPoint(x: right - outer, y: -half))
            path.addQuadCurve(to: CGPoint(x: right, y: -half + outer), control: CGPoint(x: right, y: -half))
            path.addLine(to: CGPoint(x: right, y: distance - half - inner))
            path.addQuadCurve(to: CGPoint(x: right + inner, y: distance - half), control: CGPoint(x: right, y: distance - half))
            path.addLine(to: CGPoint(x: 6, y: distance - half)); path.addLine(to: CGPoint(x: 6, y: distance + half))
            path.addLine(to: CGPoint(x: left + outer, y: distance + half))
            path.addQuadCurve(to: CGPoint(x: left, y: distance + half - outer), control: CGPoint(x: left, y: distance + half))
            path.addLine(to: CGPoint(x: left, y: half + inner))
            path.addQuadCurve(to: CGPoint(x: left - inner, y: half), control: CGPoint(x: left, y: half))
            path.addLine(to: CGPoint(x: -6, y: half)); path.closeSubpath()
        }
        return path.applying(CGAffineTransform(scaleX: 1, y: offset < 0 ? -1 : 1).concatenating(CGAffineTransform(translationX: x, y: y)))
    }

    private func dayColor(_ event: CalendarOverviewEvent) -> Color {
        let rgb = FeaturedWidgetData.colorRGB(event.colorHex)
        return Color(red: Double((rgb >> 16) & 255) / 255,
                     green: Double((rgb >> 8) & 255) / 255,
                     blue: Double(rgb & 255) / 255)
    }

    var body: some View {
        if #available(iOSApplicationExtension 17.0, *) {
            content.containerBackground(for: .widget) { WidgetGlassSurface(colors: colors) }
        } else {
            content.padding().background(WidgetGlassSurface(colors: colors))
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
