import UIKit
import Capacitor

@objc(SafeAreaBridgeViewController)
class SafeAreaBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        self.statusBarStyle = .lightContent
        setNeedsStatusBarAppearanceUpdate()

        guard let webView = self.webView else { return }

        // Fondo oscuro acorde con el tema principal de Flashmente (#0a0a0a)
        let darkBg = UIColor(red: 10.0 / 255.0, green: 10.0 / 255.0, blue: 10.0 / 255.0, alpha: 1.0)

        let containerView = UIView(frame: UIScreen.main.bounds)
        containerView.backgroundColor = darkBg

        // Reemplazar la vista raíz por el contenedor y anclar el WKWebView al Safe Area
        self.view = containerView

        webView.backgroundColor = darkBg
        webView.scrollView.backgroundColor = darkBg
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

    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let darkBg = UIColor(red: 10.0 / 255.0, green: 10.0 / 255.0, blue: 10.0 / 255.0, alpha: 1.0)
        let appWindow = UIWindow(windowScene: windowScene)
        appWindow.backgroundColor = darkBg
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
