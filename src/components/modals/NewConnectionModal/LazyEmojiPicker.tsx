import EmojiPicker, {
  Theme,
  EmojiStyle,
  SuggestionMode,
  SkinTonePickerLocation,
  type EmojiClickData,
} from "emoji-picker-react";

interface LazyEmojiPickerProps {
  onPick: (emoji: string) => void;
  searchPlaceholder?: string;
  /** Follow the app theme so the picker isn't dark on a light theme. */
  dark?: boolean;
}

/**
 * Thin wrapper around `emoji-picker-react` so it can be code-split via
 * `React.lazy`. Keeping the (heavy) picker and all of its enum config isolated
 * here keeps it out of the initial bundle — it only loads when the user opens
 * the emoji tab while choosing a connection icon.
 */
export default function LazyEmojiPicker({
  onPick,
  searchPlaceholder,
  dark = true,
}: LazyEmojiPickerProps) {
  return (
    <EmojiPicker
      theme={dark ? Theme.DARK : Theme.LIGHT}
      emojiStyle={EmojiStyle.NATIVE}
      width="100%"
      height={340}
      searchPlaceholder={searchPlaceholder}
      suggestedEmojisMode={SuggestionMode.RECENT}
      skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
      previewConfig={{ showPreview: false }}
      lazyLoadEmojis
      onEmojiClick={(data: EmojiClickData) => onPick(data.emoji)}
    />
  );
}
