# Voice Timer

A countdown timer that speaks the remaining time aloud. It is a small web app you can add to your iPhone home screen. It is free to host and use, has no accounts, no tracking and no adverts, and works offline after the first load.

## What is in this folder

| File or folder | What it is |
| --- | --- |
| `index.html` | The page itself |
| `style.css` | Colours and layout |
| `app.js` | The timer, voice and controls |
| `manifest.webmanifest` | Tells the phone the app's name, colours and icon |
| `sw.js` | Saves a copy of the app on the phone so it works offline |
| `icons/` | The app icons |
| `audio/` | 32 short voice clips |

Keep the names and folders exactly as they are.

## Publish it for free with GitHub Pages

You do this once, on a computer.

1. Go to <https://github.com> and create a free account (or sign in).
2. Click the **+** at the top right, then **New repository**.
3. Type `voice-timer` as the repository name, choose **Public**, and click **Create repository**.
4. On the next page, click the link **uploading an existing file**.
5. Open this `voice-timer` folder on your computer. Select **everything inside it** (the files and the `audio` and `icons` folders) and drag it all onto the GitHub page. Do not drag the ZIP file or the outer folder itself.
6. Wait until the upload list stops growing, then click **Commit changes**.
7. Click **Settings** (top of the repository page), then **Pages** in the left-hand menu.
8. Under **Branch**, choose **main**, leave the folder as **/ (root)**, and click **Save**.
9. Wait one to two minutes and refresh the page. GitHub shows your address:
   `https://YOUR-USERNAME.github.io/voice-timer/`

Check: when you open the repository's main page, you should see `index.html` in the list directly, next to the `audio` and `icons` folders.

## Install it on your iPhone

1. Open **Safari** on the iPhone and go to your address from step 9.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open Voice Timer from the home screen once while you are online, and wait a few seconds. This saves the app and its voice clips on the phone for offline use.

## Using it

- Pick a duration, then tap **Start**. Sound only begins after you tap a button; this is an iPhone rule.
- Set the loudness with the volume buttons on the side of the phone.
- If you hear nothing: check that the speaker icon in the app is not crossed out, turn the volume up, and try switching the phone's ring/silent switch to ring.
- The screen stays awake while the timer runs. In Low Power Mode the iPhone may refuse this.
- Keep the app open and on screen while it counts down. If you lock the phone or switch apps, iOS pauses web apps, so announcements stop. When you come back, the clock is still correct but missed announcements are not replayed.

## Changing the app later

Upload the changed files to the same repository (**Add file** then **Upload files**). The phone picks up the new version in the background; close and reopen the app twice to see it.

## Voice

The clips were recorded with the "Samantha" voice built into macOS, for personal use.
