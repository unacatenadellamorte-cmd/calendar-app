import Foundation

struct CalendarOverviewEvent: Decodable, Equatable {
    let id: String
    let title: String
    let calendarName: String
    let colorHex: String
    let startDate: String
    let endDate: String
    let startsAtIso: String?
    let endsAtIso: String?
    let allDay: Bool
    let filledLabel: Bool
}

struct CalendarOverviewPayload: Decodable, Equatable {
    let schemaVersion: Int
    let updatedAtIso: String
    let language: String
    let events: [CalendarOverviewEvent]
}

struct CalendarGridDay: Equatable {
    let key: String
    let isInDisplayedMonth: Bool
    let isToday: Bool
    let events: [CalendarOverviewEvent]
}

enum CalendarGridData {
    static let group = "group.jp.ryo.multicalendar.widget"
    static let key = "calendarOverview"
    static let emptyMessage = "予定はありません"

    static func decode(_ raw: String?) -> CalendarOverviewPayload? {
        guard let data = raw?.data(using: .utf8),
              let payload = try? JSONDecoder().decode(CalendarOverviewPayload.self, from: data),
              payload.schemaVersion == 1 else { return nil }
        return payload
    }

    static func read(defaults: UserDefaults? = UserDefaults(suiteName: group)) -> CalendarOverviewPayload? {
        decode(defaults?.string(forKey: key))
    }

    static func dayKey(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func locale(for language: String) -> Locale {
        switch language {
        case "ja": return Locale(identifier: "ja_JP")
        case "ko": return Locale(identifier: "ko_KR")
        case "zh": return Locale(identifier: "zh_CN")
        case "fr": return Locale(identifier: "fr_FR")
        case "es": return Locale(identifier: "es_ES")
        default: return Locale(identifier: "en_US")
        }
    }

    static func addEventLabel(language: String) -> String {
        switch language {
        case "ja": return "予定を追加"
        case "ko": return "일정 추가"
        case "zh": return "添加日程"
        case "fr": return "Ajouter un événement"
        case "es": return "Añadir evento"
        default: return "Add event"
        }
    }

    static func monthTitle(_ date: Date, language: String = "ja", timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale(for: language)
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = language == "ja" ? "yyyy年M月" : (language == "ko" ? "yyyy년 M월" : "LLLL yyyy")
        return formatter.string(from: date)
    }

    static func weekdayLabels(language: String) -> [String] {
        let formatter = DateFormatter()
        formatter.locale = locale(for: language)
        formatter.calendar = Calendar(identifier: .gregorian)
        return formatter.shortWeekdaySymbols ?? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    }

    static func monthGridDays(
        containing date: Date,
        timeZone: TimeZone = .current
    ) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let components = calendar.dateComponents([.year, .month], from: date)
        guard let first = calendar.date(from: components),
              let range = calendar.range(of: .day, in: .month, for: first) else { return [] }
        let weekday = calendar.component(.weekday, from: first)
        let leading = weekday - 1 // 日曜始まり
        let count = leading + range.count
        let cellCount = count <= 35 ? 35 : 42
        return (0..<cellCount).compactMap { offset in
            calendar.date(byAdding: .day, value: offset - leading, to: first).map { dayKey($0, timeZone: timeZone) }
        }
    }

    static func events(on day: String, in payload: CalendarOverviewPayload?) -> [CalendarOverviewEvent] {
        events(on: day, in: payload, timeZone: .current)
    }

    static func events(on day: String, in payload: CalendarOverviewPayload?, timeZone: TimeZone) -> [CalendarOverviewEvent] {
        guard let payload else { return [] }
        return payload.events.filter { event in
            guard !event.allDay else { return event.startDate <= day && day <= event.endDate }
            let range = timedRange(event, timeZone: timeZone)
            return range.startDate <= day && day <= range.endDate
        }
    }

    private static func timedRange(_ event: CalendarOverviewEvent, timeZone: TimeZone) -> (startDate: String, endDate: String) {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let start = parser.date(from: event.startsAtIso ?? "") ?? parserWithoutFractional(event.startsAtIso)
        let startDate = start.map { dayKey($0, timeZone: timeZone) } ?? event.startDate
        guard let end = parser.date(from: event.endsAtIso ?? "") ?? parserWithoutFractional(event.endsAtIso) else {
            return (startDate, startDate)
        }
        let endDate = dayKey(Date(timeIntervalSince1970: end.timeIntervalSince1970 - 0.001), timeZone: timeZone)
        return (startDate, endDate < startDate ? startDate : endDate)
    }

    private static func parserWithoutFractional(_ iso: String?) -> Date? {
        guard let iso else { return nil }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime]
        return parser.date(from: iso)
    }

    static func days(
        containing date: Date,
        payload: CalendarOverviewPayload?,
        timeZone: TimeZone = .current
    ) -> [CalendarGridDay] {
        let keys = monthGridDays(containing: date, timeZone: timeZone)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let month = calendar.component(.month, from: date)
        let today = dayKey(date, timeZone: timeZone)
        // 時刻解析は予定ごとに一度だけ行い、各日セルで繰り返さない。
        let ranges = (payload?.events ?? []).map { event in
            (event, event.allDay ? (startDate: event.startDate, endDate: event.endDate) : timedRange(event, timeZone: timeZone))
        }
        return keys.map { key in
            let components = key.split(separator: "-").compactMap { Int($0) }
            let inMonth = components.count == 3 && components[1] == month
            return CalendarGridDay(key: key, isInDisplayedMonth: inMonth, isToday: key == today, events: ranges.filter { $0.1.startDate <= key && key <= $0.1.endDate }.map { $0.0 })
        }
    }

    static func deepLink(forDay key: String) -> URL? {
        guard key.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              calendar.dateComponents([.year, .month, .day], from: date).year == parts[0],
              calendar.dateComponents([.year, .month, .day], from: date).month == parts[1],
              calendar.dateComponents([.year, .month, .day], from: date).day == parts[2] else { return nil }
        var components = URLComponents()
        components.scheme = "calendar-app"
        components.host = "day"
        components.path = "/" + key
        return components.url
    }

    static func createLink(for date: Date = Date(), timeZone: TimeZone = .current) -> URL {
        var components = URLComponents()
        components.scheme = "calendar-app"
        components.host = "create"
        components.path = "/" + dayKey(date, timeZone: timeZone)
        return components.url!
    }

    static func nextMidnight(after date: Date = Date(), timeZone: TimeZone = .current) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: date)) ?? date.addingTimeInterval(86400)
    }
}
