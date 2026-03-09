// lib/changelog.ts
// Single source of truth for What's New content.
//
// To publish a new release:
//   1. Prepend a new entry to the CHANGELOGS array below.
//   2. Update CURRENT_CHANGELOG_VERSION to match the new entry's version.
//   3. Every user whose localStorage still holds the old version string
//      will see the modal automatically on their next visit.
//   4. Keep the previous 2–3 entries for context; prune anything older.

export const CURRENT_CHANGELOG_VERSION = "2026-03-08";

export type ChangelogSection = {
  heading: string;
  items: string[];
};

export type ChangelogEntry = {
  version: string;   // ISO date string — also used as the localStorage key value
  title: string;
  sections: ChangelogSection[];
};

export const CHANGELOGS: ChangelogEntry[] = [
  {
    version: "2026-03-08",
    title: "What's New — March 8th",
    sections: [
      {
        heading: "New Features",
        items: [
          "Emoji reactions on reviews — 👍 ❤️ 🔥 🤡 😂 🎉",
          "Comment replies with @ mentions",
          "Backlog status — separate your owned games from your wishlist",
          "Wishlist now has its own section and page on profiles",
          "Coming Soon carousel on the homepage",
          "Who to Follow suggestions on the homepage",
          "Recent Lists section on the homepage",
          "Dedicated Stats page at /user/[username]/stats",
          "Genre breakdown with donut chart and By Decade grid",
          "Profile showcase supports pinning a review or two lists",
          "Spoiler reviews auto-reveal if you've played the game",
        ],
      },
      {
        heading: "Improvements",
        items: [
          "Played renamed to Completed",
          "Log modal adapts to status — no rating fields on Wishlist or Backlog",
          "Unreleased games only show Wishlist as a status option",
          "Wishlist and Backlog entries hidden from friend activity feeds",
          "Review edit button moved to bottom left of cards",
          "Profile stats bar cleaned up — followers and following aligned right",
          "Welcome banner on the logged-in homepage with currently playing game",
        ],
      },
      {
        heading: "Fixes",
        items: [
          "Resident Evil remakes now appear in search results",
          "All avatars and usernames link to profiles throughout the site",
          "Review spoilers on profiles respect your play history",
          "List like notifications now fire correctly",
          "Cleared notifications no longer reappear",
        ],
      },
    ],
  },
  // Future changelogs prepended above this comment.
];
