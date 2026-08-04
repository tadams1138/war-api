-- Up Migration

ALTER TABLE contestant_media ADD COLUMN variant_widths INT[];

-- Down Migration

ALTER TABLE contestant_media DROP COLUMN variant_widths;
