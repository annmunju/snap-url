#import <React/RCTBridgeDelegate.h>
#import <UIKit/UIKit.h>

@class RCTBridge;
@class EXDevLauncherController;

@interface AppDelegate : UIResponder <UIApplicationDelegate, RCTBridgeDelegate>

@property (nonatomic, strong, nonnull) UIWindow *window;
@property (nonatomic, strong, nullable) RCTBridge *bridge;

@end
