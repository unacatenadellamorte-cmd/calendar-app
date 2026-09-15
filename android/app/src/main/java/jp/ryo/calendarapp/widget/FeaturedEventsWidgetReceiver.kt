package jp.ryo.calendarapp.widget

import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver

/**
 * `FeaturedEventsWidget`(Story 5.6)の `AppWidgetProvider`。標準の
 * `ACTION_APPWIDGET_UPDATE` ブロードキャストを受けて `GlanceAppWidget.update()` を
 * 自動的に呼ぶ(Jetpack Glance の標準動作、追加コード不要)。
 *
 * このクラスの完全修飾名(`jp.ryo.calendarapp.widget.FeaturedEventsWidgetReceiver`)は
 * `src/platform/widget.ts` が `setRegisteredWidgets` に渡す FQCN と一致させること。
 * ここを変えたら widget.ts の定数も同時に直す。
 */
class FeaturedEventsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = FeaturedEventsWidget()
}
