import Foundation

// JS側で選抜済みの配列を読むだけにし、優先度の再計算や予定タイトルの保持はしない。
struct FeaturedWidgetEvent: Decodable, Equatable {
    let id: String
    let calendarName: String
    let colorHex: String
    let startsAtIso: String
    let allDay: Bool
    let schemaVersion: Int
}

enum FeaturedWidgetData {
    static let group = "group.jp.ryo.multicalendar.widget"
    static let key = "featuredEvents"
    static let emptyMessage = "この後の予定はありません"

    static func decode(_ raw: String?) -> [FeaturedWidgetEvent] {
        guard let data = raw?.data(using: .utf8),
              let events = try? JSONDecoder().decode([FeaturedWidgetEvent].self, from: data)
        else { return [] }
        // 未知の契約は表示せず、JS側と同じ最大3件に制限する。
        return Array(events.filter { $0.schemaVersion == 1 }.prefix(3))
    }

    static func read(defaults: UserDefaults? = UserDefaults(suiteName: group)) -> [FeaturedWidgetEvent] {
        decode(defaults?.string(forKey: key))
    }

    static func startLabel(_ event: FeaturedWidgetEvent, timeZone: TimeZone = .current) -> String {
        guard !event.allDay else { return "終日" }
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = parser.date(from: event.startsAtIso)
        if date == nil {
            parser.formatOptions = [.withInternetDateTime]
            date = parser.date(from: event.startsAtIso)
        }
        guard let date else { return "終日" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ja_JP")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "H:mm"
        return formatter.string(from: date)
    }

    static func colorRGB(_ hex: String) -> UInt32 {
        let value = hex.hasPrefix("#") ? String(hex.dropFirst()) : ""
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return 0x7A7A7A }
        return rgb
    }

    static func deepLink(_ event: FeaturedWidgetEvent?, now: Date = Date(), timeZone: TimeZone = .current) -> URL {
        var components = URLComponents()
        components.scheme = "calendar-app"
        if let event, !event.id.isEmpty {
            components.host = "event"
            let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
            components.percentEncodedPath = "/" + (event.id.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")
        } else {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = timeZone
            formatter.dateFormat = "yyyy-MM-dd"
            components.host = "day"
            components.path = "/" + formatter.string(from: now)
        }
        // スキームとホストは固定、パスは上でエンコード済み。
        return components.url!
    }
}
