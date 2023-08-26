CREATE TABLE "face_data" (
	"dataId"	INTEGER,
	"personId"	INTEGER,
	"data"	TEXT,
	PRIMARY KEY("dataId" AUTOINCREMENT) ON CONFLICT ABORT
);
CREATE TABLE "person" (
	"personId"	INTEGER,
	"personName"	TEXT UNIQUE,
	"personFeatures"	TEXT,
	PRIMARY KEY("personId" AUTOINCREMENT),
	UNIQUE("personName")
);
CREATE TABLE sqlite_sequence(name,seq);