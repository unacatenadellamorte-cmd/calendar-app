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
}
