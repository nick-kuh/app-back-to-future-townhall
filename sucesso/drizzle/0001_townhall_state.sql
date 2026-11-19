CREATE TABLE townhall_state (
 id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
 revision INTEGER NOT NULL CHECK(revision > 0),
 snapshot TEXT NOT NULL CHECK(json_valid(snapshot) AND length(CAST(snapshot AS BLOB)) <= 1500000)
);
