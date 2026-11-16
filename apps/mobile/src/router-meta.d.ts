// Extends vue-router's route meta (the import makes this an augmentation, not a replacement).
import 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** Open without signing in. */
    public?: boolean;
  }
}
