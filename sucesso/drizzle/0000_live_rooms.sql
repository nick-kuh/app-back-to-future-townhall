CREATE TABLE rooms (
 id TEXT PRIMARY KEY NOT NULL,
 owner_id TEXT NOT NULL,
 name TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX rooms_owner_idx ON rooms(owner_id, created_at);
--> statement-breakpoint
CREATE TABLE activities (
 room_id TEXT NOT NULL REFERENCES rooms(id),
 id TEXT NOT NULL,
 phase TEXT NOT NULL DEFAULT 'idle',
 ends_at INTEGER,
 remaining_seconds INTEGER NOT NULL DEFAULT 120,
 round_id TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(room_id, id)
);
--> statement-breakpoint
CREATE TABLE responses (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT UNIQUE NOT NULL,
 room_id TEXT NOT NULL REFERENCES rooms(id),
 activity_id TEXT NOT NULL,
 round_id TEXT NOT NULL,
 client_request_id TEXT NOT NULL,
 participant_id TEXT NOT NULL,
 name TEXT NOT NULL,
 answer TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(room_id, client_request_id)
);
--> statement-breakpoint
CREATE INDEX responses_room_cursor_idx ON responses(room_id, sequence);
--> statement-breakpoint
CREATE INDEX responses_rate_idx ON responses(room_id, participant_id, created_at);
