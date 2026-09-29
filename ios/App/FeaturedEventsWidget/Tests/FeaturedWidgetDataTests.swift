import Foundation
import XCTest
@testable import FeaturedWidgetData

final class FeaturedWidgetDataTests: XCTestCase {
    private func event(id: String = "e1", iso: String = "2026-09-17T01:02:00Z", allDay: Bool = false) -> FeaturedWidgetEvent {
        FeaturedWidgetEvent(id: id, calendarName: "仕事", colorHex: "#0072B2", startsAtIso: iso, allDay: allDay, schemaVersion: 1)
    }

    func testMissingCorruptAndEmptyPayloads() {
        for raw in [nil, "壊れたJSON", "{}", "[]", "[{\"id\":\"e1\"}]"] as [String?] {
            XCTAssertEqual(FeaturedWidgetData.decode(raw), [])
        }
    }

    func testSharedStoreContractAndReload() throws {
        let suite = "calendar-widget-test-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        XCTAssertEqual(FeaturedWidgetData.read(defaults: defaults), [])
        let json = ##"[{"id":"e1","calendarName":"仕事","colorHex":"#0072B2","startsAtIso":"2026-09-17T01:02:00Z","allDay":false,"schemaVersion":1}]"##
        defaults.set(json, forKey: "featuredEvents")
        XCTAssertEqual(FeaturedWidgetData.read(defaults: defaults), [event()])
        defaults.set("[]", forKey: "featuredEvents")
        XCTAssertEqual(FeaturedWidgetData.read(defaults: defaults), [])
    }

    func testUnknownSchemaAndMaximumCount() throws {
        let item: [String: Any] = ["id": "e1", "calendarName": "仕事", "colorHex": "#0072B2", "startsAtIso": "2026-09-17T01:02:00Z", "allDay": false, "schemaVersion": 1]
        var items = (0..<4).map { index -> [String: Any] in
            var copy = item
            copy["id"] = "e\(index)"
            return copy
        }
        let raw = String(data: try JSONSerialization.data(withJSONObject: items), encoding: .utf8)
        XCTAssertEqual(FeaturedWidgetData.decode(raw).map(\.id), ["e0", "e1", "e2"])
        items = [item.merging(["schemaVersion": 2]) { _, new in new }]
        let unknown = String(data: try JSONSerialization.data(withJSONObject: items), encoding: .utf8)
        XCTAssertEqual(FeaturedWidgetData.decode(unknown), [])
    }

    func testTimeFormatsAndFallback() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        for iso in ["2026-09-17T01:02:00Z", "2026-09-17T01:02:00.000Z", "2026-09-17T10:02:00+09:00"] {
            XCTAssertEqual(FeaturedWidgetData.startLabel(event(iso: iso), timeZone: zone), "10:02")
        }
        XCTAssertEqual(FeaturedWidgetData.startLabel(event(allDay: true)), "終日")
        XCTAssertEqual(FeaturedWidgetData.startLabel(event(iso: "不正")), "終日")
    }

    func testDeepLinksAndLocalMidnight() throws {
        XCTAssertEqual(FeaturedWidgetData.deepLink(event()).absoluteString, "calendar-app://event/e1")
        XCTAssertEqual(FeaturedWidgetData.deepLink(event(id: "a/b?#")).absoluteString, "calendar-app://event/a%2Fb%3F%23")
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-17T16:00:00Z"))
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        for value in [nil, event(id: "")] {
            XCTAssertEqual(FeaturedWidgetData.deepLink(value, now: now, timeZone: zone).absoluteString, "calendar-app://day/2026-09-18")
        }
    }

    func testColorFallback() {
        XCTAssertEqual(FeaturedWidgetData.colorRGB("#0072B2"), 0x0072B2)
        XCTAssertEqual(FeaturedWidgetData.colorRGB("#aabbcc"), 0xAABBCC)
        for value in ["red", "#12", "#GGGGGG", "FFFFFF"] {
            XCTAssertEqual(FeaturedWidgetData.colorRGB(value), 0x7A7A7A)
        }
    }

    func testCalendarOverviewDecodeAndSchema() throws {
        let raw = ##"{"schemaVersion":1,"updatedAtIso":"2026-09-29T00:00:00Z","language":"ja","events":[{"id":"e1","title":"会議","calendarName":"仕事","colorHex":"#0072B2","startDate":"2026-09-29","endDate":"2026-10-01","startsAtIso":null,"endsAtIso":null,"allDay":true,"filledLabel":false}]}"##
        let payload = try XCTUnwrap(CalendarGridData.decode(raw))
        XCTAssertEqual(payload.events.first?.id, "e1")
        XCTAssertNil(CalendarGridData.decode(raw.replacingOccurrences(of: "\"schemaVersion\":1", with: "\"schemaVersion\":2")))
        XCTAssertNil(CalendarGridData.decode("壊れたJSON"))
    }

    func testCalendarGridLeapMonthAndInclusiveEventRange() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2028-02-15T00:00:00Z"))
        let keys = CalendarGridData.monthGridDays(containing: date, timeZone: zone)
        XCTAssertEqual(keys.count, 35)
        XCTAssertTrue(keys.contains("2028-02-29"))
        let event = CalendarOverviewEvent(id: "e1", title: "連日", calendarName: "仕事", colorHex: "#0072B2", startDate: "2028-02-28", endDate: "2028-02-29", startsAtIso: nil, endsAtIso: nil, allDay: true, filledLabel: false)
        let payload = CalendarOverviewPayload(schemaVersion: 1, updatedAtIso: "", language: "ja", events: [event])
        XCTAssertEqual(CalendarGridData.events(on: "2028-02-29", in: payload), [event])
        XCTAssertEqual(CalendarGridData.events(on: "2028-03-01", in: payload), [])

        let timed = CalendarOverviewEvent(id: "t1", title: "時刻付き", calendarName: "仕事", colorHex: "#0072B2", startDate: "2028-02-28", endDate: "2028-02-28", startsAtIso: "2028-02-28T15:00:00Z", endsAtIso: "2028-02-29T15:00:00Z", allDay: false, filledLabel: true)
        let timedPayload = CalendarOverviewPayload(schemaVersion: 1, updatedAtIso: "", language: "ja", events: [timed])
        XCTAssertEqual(CalendarGridData.events(on: "2028-02-29", in: timedPayload, timeZone: zone), [timed])
        XCTAssertEqual(CalendarGridData.events(on: "2028-02-28", in: timedPayload, timeZone: zone), [])
    }

    func testCalendarGridLinksAndEmptySnapshot() throws {
        XCTAssertEqual(CalendarGridData.deepLink(forDay: "2026-09-29")?.absoluteString, "calendar-app://day/2026-09-29")
        XCTAssertNil(CalendarGridData.deepLink(forDay: "2026-9-29"))
        XCTAssertNil(CalendarGridData.deepLink(forDay: "2026-02-30"))
        XCTAssertEqual(CalendarGridData.weekdayLabels(language: "en").first, "Sun")
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-28T16:00:00Z"))
        XCTAssertEqual(CalendarGridData.createLink(for: date, timeZone: zone).absoluteString, "calendar-app://create/2026-09-29")
        XCTAssertEqual(CalendarGridData.days(containing: date, payload: nil, timeZone: zone).filter { !$0.events.isEmpty }, [])
        XCTAssertTrue(CalendarGridData.days(containing: date, payload: nil, timeZone: zone).contains { $0.key == "2026-09-29" && $0.isToday })
    }
    func testSixWeekMonthAndLocalizedLabels() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
        let date = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-08-15T00:00:00Z"))
        let days = CalendarGridData.monthGridDays(containing: date, timeZone: zone)
        XCTAssertEqual(days.count, 42)
        XCTAssertEqual(days.first, "2026-07-26")
        XCTAssertEqual(days.last, "2026-09-05")
        XCTAssertEqual(CalendarGridData.weekdayLabels(language: "fr").count, 7)
        XCTAssertNotEqual(CalendarGridData.weekdayLabels(language: "ko"), CalendarGridData.weekdayLabels(language: "en"))
        XCTAssertEqual(CalendarGridData.addEventLabel(language: "es"), "Añadir evento")
    }

}
