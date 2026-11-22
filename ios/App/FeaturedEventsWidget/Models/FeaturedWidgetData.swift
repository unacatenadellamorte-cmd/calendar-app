import Foundation

/** アプリが共有する配色。壊れた値は項目ごとに安全な既定色へ戻す。 */
struct WidgetAppearanceData: Decodable {
    var schemaVersion: Int?
    var theme: String?
    var backgroundColor: String?
    var primaryTextColor: String?
    var secondaryTextColor: String?
    var accentColor: String?
    var todayColor: String?
    var todayTextColor: String?
    /// ガラス面の透過度(0〜100)。古いペイロードでは欠損するため既定値で補う。
    var widgetTransparency: Double?
    /// 屈折の強さ(0〜100、見た目の調整値でIORではない)。古いペイロードでは欠損するため既定値で補う。
    var widgetRefraction: Double?

    /// アプリ側の既定値35%と一致させる。
    static let defaultGlassTransparency = 0.35

    /// 0〜1の透過度。欠損・非有限値は既定値、範囲外は端へ丸める。
    var glassTransparency: Double {
        guard let value = widgetTransparency, value.isFinite else { return Self.defaultGlassTransparency }
        return min(max(value, 0), 100) / 100
    }

    /// アプリ側の既定値50と一致させる。
    static let defaultGlassRefraction = 0.5

    /// 0〜1の屈折の強さ。縁の厚み・反射・色分散に使う。欠損・非有限値は既定値、範囲外は端へ丸める。
    var glassRefraction: Double {
        guard let value = widgetRefraction, value.isFinite else { return Self.defaultGlassRefraction }
        return min(max(value, 0), 100) / 100
    }

    static func read(defaults: UserDefaults? = UserDefaults(suiteName: FeaturedWidgetData.group)) -> Self? {
        decode(defaults?.string(forKey: "widgetAppearance"))
    }

    static func decode(_ raw: String?) -> Self? {
        guard let data = raw?.data(using: .utf8),
              let value = try? JSONDecoder().decode(Self.self, from: data),
              value.schemaVersion == 1 else { return nil }
        return value
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, theme, backgroundColor, primaryTextColor, secondaryTextColor,
             accentColor, todayColor, todayTextColor, widgetTransparency, widgetRefraction
    }

    /// 項目ごとに型違いを許容し、一つの不正値で全体の外観が既定へ戻らないようにする。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try? c.decodeIfPresent(Int.self, forKey: .schemaVersion)
        theme = try? c.decodeIfPresent(String.self, forKey: .theme)
        backgroundColor = try? c.decodeIfPresent(String.self, forKey: .backgroundColor)
        primaryTextColor = try? c.decodeIfPresent(String.self, forKey: .primaryTextColor)
        secondaryTextColor = try? c.decodeIfPresent(String.self, forKey: .secondaryTextColor)
        accentColor = try? c.decodeIfPresent(String.self, forKey: .accentColor)
        todayColor = try? c.decodeIfPresent(String.self, forKey: .todayColor)
        todayTextColor = try? c.decodeIfPresent(String.self, forKey: .todayTextColor)
        widgetTransparency = try? c.decodeIfPresent(Double.self, forKey: .widgetTransparency)
        widgetRefraction = try? c.decodeIfPresent(Double.self, forKey: .widgetRefraction)
    }

    func rgb(_ key: KeyPath<Self, String?>, fallback: UInt32) -> UInt32 {
        guard let value = self[keyPath: key], value.hasPrefix("#"), value.count == 7,
              value.dropFirst().allSatisfy({ $0.isASCII && $0.isHexDigit }),
              let rgb = UInt32(value.dropFirst(), radix: 16) else { return fallback }
        return rgb
    }
}

// JS側で選抜済みの配列を読むだけにし、優先度の再計算や予定タイトルの保持はしない。
struct FeaturedWidgetEvent: Decodable, Equatable {
    let id: String
    let calendarName: String
    let colorHex: String
    let startsAtIso: String
    let allDay: Bool
    let schemaVersion: Int
    var eventDate: String? = nil
    var eventEndDate: String? = nil
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

    static func startLabel(_ event: FeaturedWidgetEvent, timeZone: TimeZone = .current, now: Date = Date()) -> String {
        if event.allDay {
            // 旧保存データには暦日がないため、瞬間から別の日付を推測しない。
            guard let key = event.eventDate else { return "終日" }
            let parser = DateFormatter()
            parser.locale = Locale(identifier: "en_US_POSIX")
            parser.calendar = Calendar(identifier: .gregorian)
            parser.timeZone = TimeZone(secondsFromGMT: 0)
            parser.dateFormat = "yyyy-MM-dd"
            parser.isLenient = false
            guard let date = parser.date(from: key), parser.string(from: date) == key else { return "終日" }
            let today = DateFormatter()
            today.locale = Locale(identifier: "en_US_POSIX")
            today.calendar = Calendar(identifier: .gregorian)
            today.timeZone = timeZone
            today.dateFormat = "yyyy-MM-dd"
            let todayKey = today.string(from: now)
            if todayKey == key || (event.eventEndDate.map { key <= todayKey && todayKey < $0 } ?? false) { return "終日" }
            parser.dateFormat = "M/d"
            return parser.string(from: date) + " 終日"
        }
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
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let sameDay = calendar.isDate(date, inSameDayAs: now)
        formatter.dateFormat = sameDay ? "H:mm" : "M/d H:mm"
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
