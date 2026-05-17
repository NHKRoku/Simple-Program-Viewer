const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = 8000;

// Serve file tĩnh (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Hoặc nếu bạn để index.html cùng cấp với epg.js:
// app.use(express.static(__dirname));

// API EPG giữ nguyên
function parseXmltvTime(timeStr) {
    try {
        const raw = timeStr.slice(0, 14);
        const year = raw.slice(0, 4);
        const month = raw.slice(4, 6);
        const day = raw.slice(6, 8);
        const hour = raw.slice(8, 10);
        const minute = raw.slice(10, 12);
        const second = raw.slice(12, 14);
        return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    } catch (e) {
        return "";
    }
}

app.get('/api/epg', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.json({ status: "error", message: "Missing 'url' parameter" });
    }

    try {
        const response = await axios.get(url, { timeout: 10000 });
        const parser = new xml2js.Parser({ explicitArray: true });
        const parsed = await parser.parseStringPromise(response.data);

        const channels = {};
        const channelList = parsed.tv.channel || [];
        
        // 1. XỬ LÝ KÊNH (CHANNELS)
        for (const ch of channelList) {
            const chId = ch.$.id;
            const displayNameElem = ch['display-name'];
            const iconElem = ch.icon;

            // Fallback bóc tách tên kênh nếu dính Object đa ngôn ngữ
            let chName = chId;
            if (displayNameElem && displayNameElem[0]) {
                chName = typeof displayNameElem[0] === 'object' ? displayNameElem[0]._ : displayNameElem[0];
            }

            // Fallback bóc tách logo kênh an toàn
            let chIcon = "";
            if (iconElem && iconElem[0] && iconElem[0].$) {
                chIcon = iconElem[0].$.src || "";
            }

            channels[chId] = {
                id: chId,
                name: chName,
                icon: chIcon,
                programs: []
            };
        }

        // 2. XỬ LÝ CHƯƠNG TRÌNH (PROGRAMMES)
        const programmeList = parsed.tv.programme || [];
        for (const prog of programmeList) {
            const chId = prog.$.channel;
            if (!channels[chId]) continue;

            const titleElem = prog.title;
            const descElem = prog.desc;
            const iconElem = prog.icon;

            // Hàm helper bóc tách text thông minh: xử lý chuỗi thường lẫn Object {"_": "text"}
            const extractText = (elem) => {
                if (!elem || !elem[0]) return "";
                if (typeof elem[0] === 'object') {
                    return elem[0]._ || ""; // Lấy thuộc tính nội dung "_"
                }
                return elem[0];
            };

            // Bóc tách ảnh thumbnail của chương trình
            let progImage = "";
            if (iconElem && iconElem[0] && iconElem[0].$) {
                progImage = iconElem[0].$.src || "";
            }

            const titleText = extractText(titleElem) || "Không có tiêu đề";
            const descText = extractText(descElem);

            channels[chId].programs.push({
                title: titleText,
                desc: descText,
                image: progImage,
                start: parseXmltvTime(prog.$.start),
                stop: parseXmltvTime(prog.$.stop)
            });
        }

        res.json({ status: "success", data: Object.values(channels) });
    } catch (err) {
        console.error(err);
        res.json({ status: "error", message: err.message });
    }
});


// Phục vụ file index.html khi vào trang gốc
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.htm'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
});
