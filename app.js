const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Your bot code here
// ... Discord bot setup, music commands, etc.

// Optional: Create a simple web endpoint to keep the bot alive
app.get('/', (req, res) => {
    res.send('Music bot is running!');
});

app.listen(PORT, () => {
    console.log(`Bot is running on port ${PORT}`);
});