import { Easing } from "react-native-reanimated";

export const SWIPE_VELOCITY_THRESHOLD = 500;
export const SWIPE_DISTANCE_THRESHOLD_RATIO = 0.3;
export const FOLD_VELOCITY_THRESHOLD = 300;
export const FOLD_DISTANCE_THRESHOLD_RATIO = 0.05;
export const SPRING_CONFIG = { damping: 20, stiffness: 100 };
export const EASE_OUT_CUBIC = Easing.bezier(0.25, 0.1, 0.25, 1);
