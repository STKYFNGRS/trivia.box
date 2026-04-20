CREATE TABLE "question_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "question_subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL REFERENCES "question_categories"("id") ON DELETE CASCADE,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"notes_for_generation" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"target_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_subcategories_category_slug_unique" UNIQUE("category_id", "slug")
);
--> statement-breakpoint
CREATE INDEX "question_subcategories_category_idx" ON "question_subcategories" ("category_id");
--> statement-breakpoint
ALTER TABLE "question_generation_jobs" ADD COLUMN IF NOT EXISTS "subcategory_id" uuid REFERENCES "question_subcategories"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "question_generation_jobs_subcategory_idx" ON "question_generation_jobs" ("subcategory_id");
--> statement-breakpoint

INSERT INTO "question_categories" ("slug", "label", "sort_order", "active", "description") VALUES
('sports', 'Sports', 10, true, 'Team and individual athletics'),
('pop-culture', 'Pop Culture', 20, true, 'Trends, celebrities, memes, recent cultural moments'),
('history', 'History', 30, true, 'World and regional history'),
('science', 'Science', 40, true, 'Physics, chemistry, biology, astronomy'),
('geography', 'Geography', 50, true, 'Places, capitals, landmarks, maps'),
('arts-literature', 'Arts & Literature', 60, true, 'Books, theater, visual arts'),
('movies-tv', 'Movies & TV', 70, true, 'Film and television'),
('music', 'Music', 80, true, 'Genres, artists, instruments, theory'),
('food-drink', 'Food & Drink', 90, true, 'Cuisine, beverages, cooking'),
('nature', 'Nature', 100, true, 'Animals, plants, ecosystems, earth science'),
('politics-civics', 'Politics & Civics', 110, true, 'Government, elections, law, institutions'),
('mythology-religion', 'Mythology & Religion', 120, true, 'World religions, myths, legends'),
('technology', 'Technology', 130, true, 'Computers, internet, gadgets, engineering'),
('wordplay', 'Wordplay', 140, true, 'Language, etymology, idioms, puzzles');
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'pro-us-leagues', 'Pro US leagues', 10, true, 650, 'NFL, NBA, MLB, NHL, MLS; vary eras and teams; avoid paraphrasing the same iconic fact (e.g. slam dunk basics) twice.'
FROM question_categories WHERE slug = 'sports';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'olympics', 'Olympics & world games', 20, true, 500, 'Summer/winter sports, medals, host cities, records.'
FROM question_categories WHERE slug = 'sports';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'college-sports', 'College sports', 30, true, 450, 'NCAA traditions, bowls, March Madness, rivalries.'
FROM question_categories WHERE slug = 'sports';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'individual-sports', 'Individual sports', 40, true, 550, 'Tennis, golf, track, gymnastics, combat sports.'
FROM question_categories WHERE slug = 'sports';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'rules-records', 'Rules & records', 50, true, 400, 'Official rules edge cases, world records, scoring quirks.'
FROM question_categories WHERE slug = 'sports';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-sports', 'General sports trivia', 60, true, 550, 'Wide mix; prioritize lesser-known angles over textbook facts.'
FROM question_categories WHERE slug = 'sports';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'celebrities', 'Celebrities & influencers', 10, true, 550, NULL
FROM question_categories WHERE slug = 'pop-culture';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'memes-internet', 'Internet & memes', 20, true, 500, NULL
FROM question_categories WHERE slug = 'pop-culture';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'fashion-beauty', 'Fashion & beauty', 30, true, 400, NULL
FROM question_categories WHERE slug = 'pop-culture';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'social-media', 'Social media platforms', 40, true, 450, NULL
FROM question_categories WHERE slug = 'pop-culture';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'brands-products', 'Brands & products', 50, true, 500, NULL
FROM question_categories WHERE slug = 'pop-culture';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-pop', 'General pop culture', 60, true, 600, NULL
FROM question_categories WHERE slug = 'pop-culture';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'ancient-history', 'Ancient history', 10, true, 550, NULL
FROM question_categories WHERE slug = 'history';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'medieval-early-modern', 'Medieval & early modern', 20, true, 550, NULL
FROM question_categories WHERE slug = 'history';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'us-history', 'US history', 30, true, 650, NULL
FROM question_categories WHERE slug = 'history';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'world-wars', 'World wars & conflicts', 40, true, 500, NULL
FROM question_categories WHERE slug = 'history';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'modern-history', 'Modern history', 50, true, 550, NULL
FROM question_categories WHERE slug = 'history';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'historical-figures', 'Historical figures', 60, true, 700, NULL
FROM question_categories WHERE slug = 'history';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'physics', 'Physics', 10, true, 550, NULL
FROM question_categories WHERE slug = 'science';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'chemistry', 'Chemistry', 20, true, 500, NULL
FROM question_categories WHERE slug = 'science';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'biology', 'Biology', 30, true, 600, NULL
FROM question_categories WHERE slug = 'science';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'astronomy-space', 'Astronomy & space', 40, true, 550, NULL
FROM question_categories WHERE slug = 'science';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'earth-science', 'Earth science', 50, true, 450, NULL
FROM question_categories WHERE slug = 'science';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-science', 'General science', 60, true, 550, NULL
FROM question_categories WHERE slug = 'science';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'countries-capitals', 'Countries & capitals', 10, true, 700, NULL
FROM question_categories WHERE slug = 'geography';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'us-geography', 'US geography', 20, true, 650, NULL
FROM question_categories WHERE slug = 'geography';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'world-regions', 'World regions', 30, true, 550, NULL
FROM question_categories WHERE slug = 'geography';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'landmarks', 'Landmarks & monuments', 40, true, 550, NULL
FROM question_categories WHERE slug = 'geography';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'rivers-oceans', 'Rivers, lakes & oceans', 50, true, 500, NULL
FROM question_categories WHERE slug = 'geography';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'maps-climate', 'Maps & climate', 60, true, 450, NULL
FROM question_categories WHERE slug = 'geography';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'classic-literature', 'Classic literature', 10, true, 600, NULL
FROM question_categories WHERE slug = 'arts-literature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'modern-literature', 'Modern literature', 20, true, 550, NULL
FROM question_categories WHERE slug = 'arts-literature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'poetry-drama', 'Poetry & drama', 30, true, 450, NULL
FROM question_categories WHERE slug = 'arts-literature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'visual-arts', 'Visual arts', 40, true, 550, NULL
FROM question_categories WHERE slug = 'arts-literature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'architecture', 'Architecture', 50, true, 450, NULL
FROM question_categories WHERE slug = 'arts-literature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-arts', 'General arts & literature', 60, true, 550, NULL
FROM question_categories WHERE slug = 'arts-literature';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'classic-film', 'Classic film', 10, true, 550, NULL
FROM question_categories WHERE slug = 'movies-tv';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'modern-film', 'Modern film', 20, true, 600, NULL
FROM question_categories WHERE slug = 'movies-tv';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'television', 'Television series', 30, true, 650, NULL
FROM question_categories WHERE slug = 'movies-tv';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'directors-actors', 'Directors & actors', 40, true, 550, NULL
FROM question_categories WHERE slug = 'movies-tv';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'awards-box-office', 'Awards & box office', 50, true, 450, NULL
FROM question_categories WHERE slug = 'movies-tv';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-screen', 'General movies & TV', 60, true, 600, NULL
FROM question_categories WHERE slug = 'movies-tv';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'rock-pop', 'Rock & pop', 10, true, 650, NULL
FROM question_categories WHERE slug = 'music';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'hip-hop-rb', 'Hip-hop & R&B', 20, true, 550, NULL
FROM question_categories WHERE slug = 'music';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'country-jazz-classical', 'Country, jazz & classical', 30, true, 500, NULL
FROM question_categories WHERE slug = 'music';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'instruments-theory', 'Instruments & theory', 40, true, 500, NULL
FROM question_categories WHERE slug = 'music';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'albums-songs', 'Albums & songs', 50, true, 600, NULL
FROM question_categories WHERE slug = 'music';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-music', 'General music', 60, true, 600, NULL
FROM question_categories WHERE slug = 'music';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'world-cuisine', 'World cuisine', 10, true, 600, NULL
FROM question_categories WHERE slug = 'food-drink';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'ingredients-techniques', 'Ingredients & techniques', 20, true, 500, NULL
FROM question_categories WHERE slug = 'food-drink';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'beverages', 'Coffee, tea & spirits', 30, true, 500, NULL
FROM question_categories WHERE slug = 'food-drink';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'food-history', 'Food history', 40, true, 450, NULL
FROM question_categories WHERE slug = 'food-drink';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'restaurants-brands', 'Restaurants & brands', 50, true, 450, NULL
FROM question_categories WHERE slug = 'food-drink';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-food', 'General food & drink', 60, true, 550, NULL
FROM question_categories WHERE slug = 'food-drink';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'animals', 'Animals', 10, true, 650, NULL
FROM question_categories WHERE slug = 'nature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'plants-fungi', 'Plants & fungi', 20, true, 500, NULL
FROM question_categories WHERE slug = 'nature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'ecosystems', 'Ecosystems & conservation', 30, true, 450, NULL
FROM question_categories WHERE slug = 'nature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'weather-climate-nat', 'Weather & climate', 40, true, 450, NULL
FROM question_categories WHERE slug = 'nature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'geology-nature', 'Geology & earth', 50, true, 450, NULL
FROM question_categories WHERE slug = 'nature';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-nature', 'General nature', 60, true, 550, NULL
FROM question_categories WHERE slug = 'nature';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'us-government', 'US government', 10, true, 550, NULL
FROM question_categories WHERE slug = 'politics-civics';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'world-government', 'World governments', 20, true, 550, NULL
FROM question_categories WHERE slug = 'politics-civics';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'elections', 'Elections & campaigns', 30, true, 500, NULL
FROM question_categories WHERE slug = 'politics-civics';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'law-courts', 'Law & courts', 40, true, 550, NULL
FROM question_categories WHERE slug = 'politics-civics';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'international-orgs', 'International organizations', 50, true, 450, NULL
FROM question_categories WHERE slug = 'politics-civics';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-civics', 'General civics', 60, true, 550, NULL
FROM question_categories WHERE slug = 'politics-civics';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'world-religions', 'World religions', 10, true, 600, NULL
FROM question_categories WHERE slug = 'mythology-religion';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'mythology-classical', 'Classical mythology', 20, true, 550, NULL
FROM question_categories WHERE slug = 'mythology-religion';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'mythology-world', 'World mythology', 30, true, 500, NULL
FROM question_categories WHERE slug = 'mythology-religion';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'religious-texts', 'Texts & traditions', 40, true, 550, NULL
FROM question_categories WHERE slug = 'mythology-religion';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'folklore', 'Folklore & legends', 50, true, 500, NULL
FROM question_categories WHERE slug = 'mythology-religion';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-myth', 'General mythology & religion', 60, true, 550, NULL
FROM question_categories WHERE slug = 'mythology-religion';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'computers-software', 'Computers & software', 10, true, 600, NULL
FROM question_categories WHERE slug = 'technology';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'internet-web', 'Internet & web', 20, true, 550, NULL
FROM question_categories WHERE slug = 'technology';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'gadgets-hardware', 'Gadgets & hardware', 30, true, 500, NULL
FROM question_categories WHERE slug = 'technology';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'ai-data', 'AI & data', 40, true, 550, NULL
FROM question_categories WHERE slug = 'technology';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'engineering-inventions', 'Engineering & inventions', 50, true, 550, NULL
FROM question_categories WHERE slug = 'technology';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-tech', 'General technology', 60, true, 550, NULL
FROM question_categories WHERE slug = 'technology';
--> statement-breakpoint

INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'etymology', 'Etymology & origins', 10, true, 550, NULL
FROM question_categories WHERE slug = 'wordplay';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'idioms-phrases', 'Idioms & phrases', 20, true, 550, NULL
FROM question_categories WHERE slug = 'wordplay';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'spelling-grammar', 'Spelling & grammar', 30, true, 450, NULL
FROM question_categories WHERE slug = 'wordplay';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'puzzles-riddles', 'Puzzles & riddles', 40, true, 450, NULL
FROM question_categories WHERE slug = 'wordplay';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'vocabulary', 'Vocabulary', 50, true, 600, NULL
FROM question_categories WHERE slug = 'wordplay';
INSERT INTO "question_subcategories" ("category_id", "slug", "label", "sort_order", "active", "target_count", "notes_for_generation")
SELECT id, 'general-wordplay', 'General wordplay', 60, true, 550, NULL
FROM question_categories WHERE slug = 'wordplay';
