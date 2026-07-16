/// <reference types="vite/client" />

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: {
          client_id: string;
          callback: (response: { credential: string }) => void;
          cancel_on_tap_outside?: boolean;
          prompt_parent_id?: string;
          nonce?: string;
          context?: string;
          state_cookie_domain?: string;
          ux_mode?: 'popup' | 'redirect';
          allowed_parent_origin?: string | string[];
          intermediate_iframe_close_callback?: () => void;
          itp_support?: boolean;
          use_fedcm_for_prompt?: boolean;
          auto_prompt_enabled?: boolean;
        }) => void;
        prompt: (momentListener?: (notification: {
          isDisplayMoment: boolean;
          isDisplayed: () => boolean;
          isNotDisplayed: () => boolean;
          isSkippedMoment: () => boolean;
          isDismissedMoment: () => boolean;
          getNotDisplayedReason: () => string;
          getSkippedReason: () => string;
          getDismissedReason: () => string;
          getMomentType: () => string;
        }) => void) => void;
        renderButton: (element: HTMLElement, options: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          shape?: 'rectangular' | 'pill' | 'square' | 'circle';
          logo_alignment?: 'left' | 'center';
          width?: number;
          locale?: string;
        }) => void;
        disableAutoSelect: () => void;
        storeCredential: (credential: string, callback?: () => void) => void;
        cancel: () => void;
        cancelPrompt: () => void;
        revoke: (hint: string, callback?: (response: { successful: boolean; error?: string }) => void) => void;
      };
    };
  };
}
