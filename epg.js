const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');
const app = express();
const PORT = 8000;
app.use(express.static(path.join(__dirname, 'public')));
function parseXmltvTimeToMachineLocal(timeStr) {
    try {
        const year = timeStr.slice(0, 4);
        const month = timeStr.slice(4, 6);
        const day = timeStr.slice(6, 8);
        const hour = timeStr.slice(8, 10);
        const minute = timeStr.slice(10, 12);
        const second = timeStr.slice(12, 14);
        const offset = timeStr.slice(15);
        const offsetSign = offset.charAt(0);
        const offsetHours = parseInt(offset.slice(1, 3), 10);
        const offsetMinutes = parseInt(offset.slice(3, 5), 10);
        let isoFormatted = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        if (offsetSign === '+' || offsetSign === '-') {
            isoFormatted += `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
        } else {
            isoFormatted += 'Z';
        }
        const parsedDate = new Date(isoFormatted);
        if (isNaN(parsedDate.getTime())) return "";
        const pad = (num) => String(num).padStart(2, '0');
        return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}T${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}:${pad(parsedDate.getSeconds())}`;
    } catch {
        return "";
    }
}
function getXmltvNowString() {
    const d = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
const extractText = (elem) => {
    if (!elem?.[0]) return "";
    return typeof elem[0] === 'object' ? elem[0]._ || "" : elem[0];
};
app.get('/api/epg', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.json({ status: "error", message: "Missing 'url' parameter" });
    }
    console.log(`[EPG Server] URLからソースデータを読み込んでいます: ${url}`);
    try {
        const response = await axios.get(url, {
            timeout: 180000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        const parser = new xml2js.Parser({ explicitArray: true });
        const parsed = await parser.parseStringPromise(response.data);
        const channels = {};
        const channelList = parsed.tv.channel || [];
        for (const ch of channelList) {
            const chId = ch.$.id;
            channels[chId] = {
                id: chId,
                name: extractText(ch['display-name']) || chId,
                icon: ch.icon?.[0]?.$?.src || "",
                programs: []
            };
        }
        const xmltvNow = getXmltvNowString();
        const programmeList = parsed.tv.programme || [];
        let prunedCount = 0;
        let skippedNoTitleCount = 0;
        for (const prog of programmeList) {
            const chId = prog.$.channel;
            if (!channels[chId]) continue;
            const startTime = parseXmltvTimeToMachineLocal(prog.$.start);
            const stopTime = parseXmltvTimeToMachineLocal(prog.$.stop);
            if (!startTime || !stopTime) continue;
            if (stopTime.replace(/[-T:]/g, "") < xmltvNow) {
                prunedCount++;
                continue;
            }
            const titleText = extractText(prog.title).trim();
            if (!titleText) {
                skippedNoTitleCount++;
                continue;
            }
            channels[chId].programs.push({
                title: titleText,
                desc: extractText(prog.desc),
                image: prog.icon?.[0]?.$?.src || "",
                start: startTime,
                stop: stopTime
            });
        }
        console.log(`[EPG Server] 完了しました！過去のプログラムを ${prunedCount} 個クリーンアップしました, 無題のスペースは ${skippedNoTitleCount} を削除します.`);
        res.json({ status: "success", data: Object.values(channels) });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: err.message });
    }
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.htm'));
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバーは現在次のアドレスで稼働しています:  http://0.0.0.0:${PORT}`);
});
