import UIKit
import Capacitor

@objc(SafeAreaBridgeViewController)
class SafeAreaBridgeViewController: CAPBridgeViewController {
    
    // Color de fondo adaptativo dinámico según el modo del sistema (oscuro #0a0a0a / claro systemBackground)
    private let adaptiveBg = UIColor { traitCollection in
        if traitCollection.userInterfaceStyle == .dark {
            return UIColor(red: 10.0 / 255.0, green: 10.0 / 255.0, blue: 10.0 / 255.0, alpha: 1.0)
        } else {
            return UIColor.systemBackground
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        self.statusBarStyle = traitCollection.userInterfaceStyle == .dark ? .lightContent : .darkContent
        setNeedsStatusBarAppearanceUpdate()

        guard let webView = self.webView else { return }

        let containerView = UIView(frame: UIScreen.main.bounds)
        containerView.backgroundColor = adaptiveBg

        // Reemplazar la vista raíz por el contenedor adaptativo y anclar el WKWebView al Safe Area
        self.view = containerView

        webView.backgroundColor = adaptiveBg
        webView.scrollView.backgroundColor = adaptiveBg
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        containerView.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: containerView.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: containerView.safeAreaLayoutGuide.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: containerView.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: containerView.safeAreaLayoutGuide.trailingAnchor)
        ])
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
            self.statusBarStyle = traitCollection.userInterfaceStyle == .dark ? .lightContent : .darkContent
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return traitCollection.userInterfaceStyle == .dark ? .lightContent : .darkContent
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let adaptiveBg = UIColor { traitCollection in
            if traitCollection.userInterfaceStyle == .dark {
                return UIColor(red: 10.0 / 255.0, green: 10.0 / 255.0, blue: 10.0 / 255.0, alpha: 1.0)
            } else {
                return UIColor.systemBackground
            }
        }

        let appWindow = UIWindow(windowScene: windowScene)
        appWindow.backgroundColor = adaptiveBg
        appWindow.rootViewController = SafeAreaBridgeViewController()
        appWindow.makeKeyAndVisible()
        window = appWindow

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
