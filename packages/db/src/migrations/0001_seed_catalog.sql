INSERT INTO "catalog_apps" (
	"id", "slug", "name", "description", "category", "publisher", "homepage", "source_url", "icon_url"
) VALUES
	('chrome', 'chrome', 'Google Chrome', 'Google''s cross-platform web browser.', 'browser', 'Google', 'https://www.google.com/chrome/', 'https://www.google.com/chrome/', NULL),
	('firefox', 'firefox', 'Mozilla Firefox', 'Open-source web browser by Mozilla.', 'browser', 'Mozilla', 'https://www.mozilla.org/firefox/', 'https://github.com/mozilla-firefox/firefox', NULL),
	('vscode', 'vscode', 'Visual Studio Code', 'Source-code editor with an extensible development ecosystem.', 'developer-tools', 'Microsoft', 'https://code.visualstudio.com/', 'https://github.com/microsoft/vscode', NULL),
	('git', 'git', 'Git', 'Distributed version control system.', 'developer-tools', 'Git Project', 'https://git-scm.com/', 'https://github.com/git/git', NULL),
	('nodejs-lts', 'nodejs-lts', 'Node.js LTS', 'Long-term support release line of the Node.js runtime.', 'developer-tools', 'OpenJS Foundation', 'https://nodejs.org/', 'https://github.com/nodejs/node', NULL),
	('vlc', 'vlc', 'VLC media player', 'Open-source multimedia player.', 'media', 'VideoLAN', 'https://www.videolan.org/vlc/', 'https://code.videolan.org/videolan/vlc', NULL),
	('sevenzip', 'sevenzip', '7-Zip', 'Open-source file archiver with high compression ratios.', 'utility', 'Igor Pavlov', 'https://www.7-zip.org/', 'https://www.7-zip.org/', NULL),
	('discord', 'discord', 'Discord', 'Voice, video, and text communication client.', 'communication', 'Discord', 'https://discord.com/', 'https://discord.com/download', NULL),
	('spotify', 'spotify', 'Spotify', 'Music and podcast streaming client.', 'media', 'Spotify', 'https://www.spotify.com/', 'https://www.spotify.com/download/', NULL),
	('docker-desktop', 'docker-desktop', 'Docker Desktop', 'Desktop container development environment.', 'container', 'Docker', 'https://www.docker.com/products/docker-desktop/', 'https://www.docker.com/products/docker-desktop/', NULL)
ON CONFLICT ("id") DO UPDATE SET
	"slug" = EXCLUDED."slug",
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"category" = EXCLUDED."category",
	"publisher" = EXCLUDED."publisher",
	"homepage" = EXCLUDED."homepage",
	"source_url" = EXCLUDED."source_url",
	"icon_url" = EXCLUDED."icon_url",
	"updated_at" = now();
--> statement-breakpoint
DELETE FROM "app_providers"
WHERE "app_id" IN (
	'chrome', 'firefox', 'vscode', 'git', 'nodejs-lts',
	'vlc', 'sevenzip', 'discord', 'spotify', 'docker-desktop'
);
--> statement-breakpoint
INSERT INTO "app_providers" ("app_id", "platform", "provider", "package_id") VALUES
	('chrome', 'windows', 'winget', 'Google.Chrome'),
	('chrome', 'macos', 'homebrew', 'google-chrome'),
	('chrome', 'linux', 'flatpak', 'com.google.Chrome'),
	('chrome', 'android', 'play-store', 'com.android.chrome'),
	('firefox', 'windows', 'winget', 'Mozilla.Firefox'),
	('firefox', 'macos', 'homebrew', 'firefox'),
	('firefox', 'linux', 'flatpak', 'org.mozilla.firefox'),
	('firefox', 'android', 'play-store', 'org.mozilla.firefox'),
	('vscode', 'windows', 'winget', 'Microsoft.VisualStudioCode'),
	('vscode', 'macos', 'homebrew', 'visual-studio-code'),
	('vscode', 'linux', 'flatpak', 'com.visualstudio.code'),
	('git', 'windows', 'winget', 'Git.Git'),
	('git', 'macos', 'homebrew', 'git'),
	('git', 'linux', 'apt', 'git'),
	('nodejs-lts', 'windows', 'winget', 'OpenJS.NodeJS.LTS'),
	('nodejs-lts', 'macos', 'homebrew', 'node@24'),
	('vlc', 'windows', 'winget', 'VideoLAN.VLC'),
	('vlc', 'macos', 'homebrew', 'vlc'),
	('vlc', 'linux', 'flatpak', 'org.videolan.VLC'),
	('vlc', 'android', 'play-store', 'org.videolan.vlc'),
	('sevenzip', 'windows', 'winget', '7zip.7zip'),
	('sevenzip', 'macos', 'homebrew', 'sevenzip'),
	('sevenzip', 'linux', 'apt', '7zip'),
	('discord', 'windows', 'winget', 'Discord.Discord'),
	('discord', 'macos', 'homebrew', 'discord'),
	('discord', 'linux', 'flatpak', 'com.discordapp.Discord'),
	('discord', 'android', 'play-store', 'com.discord'),
	('spotify', 'windows', 'winget', 'Spotify.Spotify'),
	('spotify', 'macos', 'homebrew', 'spotify'),
	('spotify', 'linux', 'flatpak', 'com.spotify.Client'),
	('spotify', 'android', 'play-store', 'com.spotify.music'),
	('docker-desktop', 'windows', 'winget', 'Docker.DockerDesktop'),
	('docker-desktop', 'macos', 'homebrew', 'docker-desktop'),
	('docker-desktop', 'linux', 'apt', 'docker-desktop');
