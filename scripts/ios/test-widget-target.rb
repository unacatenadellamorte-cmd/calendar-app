# frozen_string_literal: true

require 'minitest/autorun'
require 'tmpdir'
require 'fileutils'
require 'rbconfig'
require 'xcodeproj'

class WidgetTargetTest < Minitest::Test
  def test_target_embedding_and_repeated_setup
    root = File.expand_path('../..', __dir__)
    Dir.mktmpdir('calendar-widget-') do |temp|
      FileUtils.cp_r(File.join(root, 'ios/App/App.xcodeproj'), temp)
      FileUtils.cp_r(File.join(root, 'ios/App/FeaturedEventsWidget'), temp)
      FileUtils.mkdir_p(File.join(temp, 'App'))
      FileUtils.cp(File.join(root, 'ios/App/App/App.entitlements'), File.join(temp, 'App'))
      path = File.join(temp, 'App.xcodeproj')
      script = File.join(__dir__, 'add-widget-target.rb')
      assert system(RbConfig.ruby, script, path), '初回生成に失敗'
      first = File.binread(File.join(path, 'project.pbxproj'))
      scheme_path = File.join(path, 'xcshareddata/xcschemes/App.xcscheme')
      first_scheme = File.binread(scheme_path)
      assert system(RbConfig.ruby, script, path), '再実行に失敗'
      assert_equal first, File.binread(File.join(path, 'project.pbxproj')), '再実行で差分が発生'
      assert_equal first_scheme, File.binread(scheme_path), '既存スキームが変更された'

      project = Xcodeproj::Project.open(path)
      app = project.targets.find { |target| target.name == 'App' }
      widgets = project.targets.select { |target| target.name == 'FeaturedEventsWidget' }
      assert_equal 1, widgets.length
      widget = widgets.first
      assert_equal 3, widget.source_build_phase.files.length
      widget.source_build_phase.files_references.each do |ref|
        assert File.file?(ref.real_path), "ソースが見つからない: #{ref.path}"
      end
      foundation = widget.frameworks_build_phase.files_references.find { |ref| ref.name == 'Foundation.framework' }
      assert_equal 'SDKROOT', foundation.source_tree
      assert_equal 'System/Library/Frameworks/Foundation.framework', foundation.path
      assert_equal [widget], app.dependencies.map(&:target)
      embed = app.copy_files_build_phases.find { |phase| phase.name == 'Embed App Extensions' }
      assert_equal '13', embed.dst_subfolder_spec
      assert_equal [widget.product_reference], embed.files.map(&:file_ref)
      [app, widget].each do |target|
        target.build_configurations.each do |config|
          ref = config.build_settings.fetch('CODE_SIGN_ENTITLEMENTS')
          plist = Xcodeproj::Plist.read_from_path(File.join(temp, ref))
          assert_equal ['group.jp.ryo.multicalendar.widget'], plist['com.apple.security.application-groups']
        end
      end
      assert app.package_product_dependencies.any? { |product| product.product_name == 'CapApp-SPM' }, '既存SPM依存が消失'
    end
  end

  def test_create_widget_in_project_without_extension
    root = File.expand_path('../..', __dir__)
    Dir.mktmpdir('calendar-widget-new-') do |temp|
      path = File.join(temp, 'App.xcodeproj')
      project = Xcodeproj::Project.new(path)
      project.new_target(:application, 'App', :ios, '15.0')
      project.main_group.new_group('App', 'App')
      project.save
      FileUtils.cp_r(File.join(root, 'ios/App/FeaturedEventsWidget'), temp)
      FileUtils.mkdir_p(File.join(temp, 'App'))
      FileUtils.cp(File.join(root, 'ios/App/App/App.entitlements'), File.join(temp, 'App'))
      assert system(RbConfig.ruby, File.join(__dir__, 'add-widget-target.rb'), path)
      targets = Xcodeproj::Project.open(path).targets
      assert_equal %w[App FeaturedEventsWidget], targets.map(&:name)
      assert_equal 3, targets.last.source_build_phase.files.length
    end
  end
end
