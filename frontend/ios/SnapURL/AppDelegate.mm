#import "AppDelegate.h"

#if DEBUG
#import <EXDevLauncher/EXDevLauncherController.h>
#endif
#import <React/RCTBridge.h>
#import <React/RCTBridge+Private.h>
#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTRootView.h>

#if DEBUG
@interface AppDelegate () <EXDevLauncherControllerDelegate>
@end
#endif

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];

#if DEBUG
  EXDevLauncherController *controller = [EXDevLauncherController sharedInstance];
  [controller startWithWindow:self.window delegate:self launchOptions:launchOptions];
#else
  [self initializeReactNativeApp];
#endif

  return YES;
}

- (RCTBridge *)initializeReactNativeApp
{
#if DEBUG
  NSDictionary *launchOptions = [EXDevLauncherController.sharedInstance getLaunchOptions];
#else
  NSDictionary *launchOptions = nil;
#endif
  self.bridge = [[RCTBridge alloc] initWithDelegate:self launchOptions:launchOptions];
  RCTRootView *rootView = [[RCTRootView alloc] initWithBridge:self.bridge moduleName:@"main" initialProperties:@{}];
  rootView.backgroundColor = [UIColor systemBackgroundColor];

  UIViewController *rootViewController = [UIViewController new];
  rootViewController.view = rootView;
  self.window.rootViewController = rootViewController;
  [self.window makeKeyAndVisible];

  return self.bridge;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  NSURL *sourceURL = [[EXDevLauncherController sharedInstance] sourceUrl];
  if (sourceURL != nil) {
    return sourceURL;
  }
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
#if DEBUG
  if ([EXDevLauncherController.sharedInstance onDeepLink:url options:options]) {
    return YES;
  }
#endif

  return [RCTLinkingManager application:application openURL:url options:options];
}

- (BOOL)application:(UIApplication *)application
continueUserActivity:(NSUserActivity *)userActivity
 restorationHandler:(void (^)(NSArray<id<UIUserActivityRestoring>> *_Nullable))restorationHandler
{
  return [RCTLinkingManager application:application
                   continueUserActivity:userActivity
                     restorationHandler:restorationHandler];
}

#if DEBUG
- (void)devLauncherController:(EXDevLauncherController *)developmentClientController
          didStartWithSuccess:(BOOL)success
{
  [self initializeReactNativeApp];
  developmentClientController.appBridge = self.bridge.batchedBridge;
}
#endif

- (BOOL)isReactInstanceValid
{
  return self.bridge != nil && self.bridge.valid;
}

- (void)destroyReactInstance
{
  [self.bridge invalidate];
  self.bridge = nil;
}

@end
