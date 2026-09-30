# frozen_string_literal: true
require 'json'
require 'xcodeproj'

# 検証済みのUUIDだけを、対象のRelease構成に反映する。
settings = JSON.parse(File.read(ARGV.fetch(0)))
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
{ 'App' => 'jp.ryo.multicalendar', 'FeaturedEventsWidget' => 'jp.ryo.multicalendar.FeaturedEventsWidget' }.each do |name, bundle|
  target = project.targets.find { |item| item.name == name }
  abort '署名対象ターゲットが無い' unless target
  config = target.build_configurations.find { |item| item.name == 'Release' }
  config.build_settings.merge!({
    'CODE_SIGN_STYLE' => 'Manual',
    'DEVELOPMENT_TEAM' => settings.fetch('team'),
    'CODE_SIGN_IDENTITY' => settings.fetch('identity'),
    'PROVISIONING_PROFILE_SPECIFIER' => settings.fetch('profiles').fetch(bundle),
    'PRODUCT_BUNDLE_IDENTIFIER' => bundle,
    'MARKETING_VERSION' => ENV.fetch('IOS_RELEASE_VERSION'),
    'CURRENT_PROJECT_VERSION' => ENV.fetch('IOS_RELEASE_BUILD')
  })
end
project.save
