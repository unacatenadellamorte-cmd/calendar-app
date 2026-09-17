# frozen_string_literal: true

require 'xcodeproj'

# 再実行してもターゲット・参照・コピー処理が増えないよう、既存の要素を再利用する。
project_path = ARGV.fetch(0, File.expand_path('../../ios/App/App.xcodeproj', __dir__))
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'App' }
abort 'Appターゲットが見つからない' unless app

widget_name = 'FeaturedEventsWidget'
widget_dir = File.join(File.dirname(project_path), widget_name)
files = %w[Models/FeaturedWidgetData.swift FeaturedEventsWidget.swift FeaturedEventsWidgetBundle.swift]
(files + %w[Info.plist FeaturedEventsWidget.entitlements]).each do |path|
  abort "必要なファイルが無い: #{path}" unless File.file?(File.join(widget_dir, path))
end

widget = project.targets.find { |target| target.name == widget_name }
widget ||= project.new_target(:app_extension, widget_name, :ios, '15.0')
abort '既存ターゲットの種類が一致しない' unless widget.product_type == 'com.apple.product-type.app-extension'
# xcodeprojの既定SDKパスには生成環境の版が入る。シミュレータや別Xcodeでも使える参照へ揃える。
widget.frameworks_build_phase.files_references.each do |ref|
  next unless File.basename(ref.path.to_s) == 'Foundation.framework'

  ref.path = 'System/Library/Frameworks/Foundation.framework'
  ref.source_tree = 'SDKROOT'
end
group = project.main_group.groups.find { |item| item.path == widget_name }
group ||= project.main_group.new_group(widget_name, widget_name)

files.each do |path|
  ref = group.files.find { |item| item.path == path } || group.new_file(path)
  widget.source_build_phase.add_file_reference(ref, true)
end
%w[Info.plist FeaturedEventsWidget.entitlements].each do |path|
  group.new_file(path) unless group.files.any? { |item| item.path == path }
end

widget.build_configurations.each do |config|
  app_settings = app.build_configurations.find { |item| item.name == config.name }.build_settings
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'jp.ryo.multicalendar.FeaturedEventsWidget',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'SWIFT_VERSION' => '5.0',
    'IPHONEOS_DEPLOYMENT_TARGET' => '15.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'INFOPLIST_FILE' => "#{widget_name}/Info.plist",
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'CODE_SIGN_ENTITLEMENTS' => "#{widget_name}/#{widget_name}.entitlements",
    'CODE_SIGN_STYLE' => 'Automatic',
    'CURRENT_PROJECT_VERSION' => app_settings.fetch('CURRENT_PROJECT_VERSION', '1'),
    'MARKETING_VERSION' => app_settings.fetch('MARKETING_VERSION', '1.0'),
    'APPLICATION_EXTENSION_API_ONLY' => 'YES',
    'SKIP_INSTALL' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  })
  if app_settings['DEVELOPMENT_TEAM']
    config.build_settings['DEVELOPMENT_TEAM'] = app_settings['DEVELOPMENT_TEAM']
  end
end

app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'jp.ryo.multicalendar'
end
app_group = project.main_group.groups.find { |item| item.path == 'App' }
abort 'Appグループが見つからない' unless app_group
app_group.new_file('App.entitlements') unless app_group.files.any? { |item| item.path == 'App.entitlements' }

attributes = project.root_object.attributes['TargetAttributes'] ||= {}
[app, widget].each do |target|
  attrs = attributes[target.uuid] ||= {}
  capabilities = attrs['SystemCapabilities'] ||= {}
  capabilities['com.apple.ApplicationGroups.iOS'] = { 'enabled' => 1 }
end

app.add_dependency(widget) unless app.dependencies.any? { |dependency| dependency.target == widget }
embed = app.copy_files_build_phases.find { |phase| phase.name == 'Embed App Extensions' }
embed ||= app.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
embed.dst_path = ''
build_file = embed.files.find { |file| file.file_ref == widget.product_reference }
build_file ||= embed.add_file_reference(widget.product_reference, true)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
# CIのクリーンなチェックアウトでも-scheme Appを解決できるよう共有スキームを保存する。
scheme_path = File.join(project_path, 'xcshareddata/xcschemes/App.xcscheme')
unless File.file?(scheme_path)
  scheme = Xcodeproj::XCScheme.new
  scheme.add_build_target(app)
  scheme.set_launch_target(app)
  scheme.save_as(project_path, 'App', true)
end
puts 'iOSウィジェットのターゲット・共有領域・埋め込みを設定した'
