// All UI copy in one place. Keep it short, real, a bit cheeky.
// Structure supports future i18n (add `nl` object for Dutch).

const copy = {
  en: {
    landing: {
      headline: "Who has the pics\nfrom last night?",
      sub: "Drop yours. Grab theirs. No app needed.",
      cta: "Start an album",
    },
    create: {
      headline: "Name the night.",
      placeholder: "e.g. Daan's birthday",
      cta: "Create",
    },
    host: {
      scanPrompt: "Scan to join.",
      saveLinkWarning: "Save this link or lose the album.",
      copyLink: "Copy host link",
      copied: "Copied!",
      expiresIn: (days: number) => `Expires in ${days} days`,
      stats: (guests: number, uploads: number) =>
        `${guests} people · ${uploads} uploads`,
    },
    join: {
      headline: "What's your name?",
      placeholder: "First name",
      cta: "Join",
    },
    upload: {
      cta: "Add photos",
      uploading: (done: number, total: number) =>
        `Uploading ${done} of ${total}…`,
      keepOpen: "Keep this page open while uploading.",
    },
    grid: {
      empty: "No photos yet — be the first.",
      filterAll: "Everyone",
      filterMine: "Mine",
    },
    errors: {
      uploadFailed: "Upload failed — tap to retry.",
      generic: "Something went wrong. Try again.",
    },
  },
};

export default copy;
export type Copy = typeof copy.en;
