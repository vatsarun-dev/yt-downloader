import ytdl from "@distube/ytdl-core";

(async () => {
    try {
        console.log("Fetching info...");
        const info = await ytdl.getInfo("https://youtu.be/czgm5uaO3gI?si=RY4lWeubaEKvc8uB");
        console.log("Success! Title:", info.videoDetails.title);
    } catch (error) {
        console.error("Error:", error);
    }
})();
