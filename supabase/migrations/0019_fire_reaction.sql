-- 0019_fire_reaction.sql
-- Add 🔥 to the allowed emoji set for review_reactions.

ALTER TABLE review_reactions
  DROP CONSTRAINT IF EXISTS review_reactions_emoji_check;

ALTER TABLE review_reactions
  ADD CONSTRAINT review_reactions_emoji_check
  CHECK (emoji IN ('👍', '❤️', '🔥', '🤡', '😂', '🎉'));
