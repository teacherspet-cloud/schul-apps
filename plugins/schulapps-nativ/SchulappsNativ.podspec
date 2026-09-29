require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SchulappsNativ'
  s.version = package['version']
  s.summary = package['description']
  s.license = { :type => 'Proprietary' }
  s.homepage = 'https://github.com/teacherspet-cloud/schul-apps'
  s.author = package['author']
  s.source = { :git => 'https://github.com/teacherspet-cloud/schul-apps.git', :tag => "v#{s.version}" }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.frameworks = 'WebKit', 'PDFKit', 'VisionKit', 'Security'
  s.swift_version = '5.9'
end
