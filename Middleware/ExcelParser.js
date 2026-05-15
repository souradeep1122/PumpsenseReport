const XLSX = require("xlsx");

/**
 * Converts Excel Serial Date/Time to a JS Date object
 */
const excelToJSDate = (serial) => {
    if (!serial || isNaN(serial)) return null;
    // Excel dates are days since 1899-12-30.
    // We convert days to milliseconds (86400000 ms per day)
    return new Date(Math.round((serial - 25569) * 86400 * 1000));
};

/**
 * Format Date to YYYY-MM-DD
 */
const formatDate = (value) => {
    if (typeof value === "number") {
        const d = excelToJSDate(value);
        return d ? d.toISOString().split('T')[0] : value;
    }
    return value;
};

/**
 * Helper to convert Excel serial time to readable string (HH:mm AM/PM)
 */
const excelTimeToString = (value) => {
    if (typeof value !== "number") return value;

    // If the number is > 1, it might be a full date-time. We only want the decimal part (the time).
    const timeFraction = value % 1;
    const totalSeconds = Math.round(86400 * timeFraction);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHour = hours % 12 || 12;
    return `${formattedHour}:${minutes.toString().padStart(2, "0")} ${ampm}`;
};

/**
 * Strict number extraction - ensures we don't accidentally treat dates as pure numbers
 */
const getNumberStrict = (val) => {
    if (val === null || val === undefined || val === "") return 0;
    if (typeof val === "number") return val;
    const num = parseFloat(String(val).replace(/[^\d.-]/g, ""));
    return isNaN(num) ? 0 : num;
};

const num = v => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

/**
 * Enhanced Search: Distinguishes between finding text, numbers, or dates
 */
const smartFindVal = (rows, keyword, type = "any") => {
    const key = keyword.toLowerCase();
    for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
            const cell = String(rows[r][c] || "").toLowerCase().trim();
            if (cell.includes(key)) {
                // Check relative cells: Right, then Below, then Diagonal
                const offsets = [
                    { dr: 0, dc: 1 }, { dr: 0, dc: 2 }, { dr: 0, dc: 3 }, // Right
                    { dr: 1, dc: 0 }, { dr: 2, dc: 0 },                    // Below
                    { dr: 1, dc: 1 }                                        // Diagonal
                ];

                for (let off of offsets) {
                    if (rows[r + off.dr] && rows[r + off.dr][c + off.dc] !== undefined) {
                        const val = rows[r + off.dr][c + off.dc];
                        if (val === "" || val === null) continue;

                        if (type === "date") return formatDate(val);
                        if (type === "time") return excelTimeToString(val);
                        return val;
                    }
                }
            }
        }
    }
    return null;
};

const smartFindText = (rows, keyword) => {
    const val = smartFindVal(rows, keyword);
    return val ? String(val).trim() : null;
};

/**
 * FLOW TOLERANCE — Triple (Lower, Middle, Upper)
 *
 * Confirmed Excel layout:
 *   Label row: [..., "flow tolerance", "", 104.4752, 113.56, 122.6448, ...]
 *   Next row:  [...,                   "",   225.04, 225.04,   225.04, ...]  ← reference, ignored
 *
 * The three values on the LABEL ROW itself are lower / middle / upper.
 */
const findFlowTolerance = (rows, label) => {
    const l = label.toLowerCase();
    for (let r = 0; r < rows.length; r++) {
        const rowText = rows[r].map(c => String(c).toLowerCase()).join(" ");
        if (rowText.includes(l)) {
            const nums = rows[r]
                .map(v => getNumberStrict(v))
                .filter(n => n !== 0)
                .slice(0, 3);                          // first 3 non-zero numbers = lower, mid, upper

            if (nums.length >= 3) {
                const sorted = [...nums].sort((a, b) => a - b);
                return { lower: sorted[0], middle: sorted[1], upper: sorted[2] };
            } else if (nums.length === 2) {
                const sorted = [...nums].sort((a, b) => a - b);
                return { lower: sorted[0], middle: (sorted[0] + sorted[1]) / 2, upper: sorted[1] };
            } else if (nums.length === 1) {
                return { lower: nums[0], middle: nums[0], upper: nums[0] };
            }
        }
    }
    return { lower: 0, middle: 0, upper: 0 };
};

/**
 * HEAD TOLERANCE — Triple (Lower, Middle, Upper)
 *
 * Confirmed Excel layout:
 *   Label row: [..., "Head tolerance", "", 113.56,  113.56,  113.56,  ...]  ← reference values, IGNORED
 *   Next row:  [...,                   "", 213.788, 225.04,  236.292, ...]  ← ACTUAL lower / mid / upper
 *
 * CRITICAL: The label row repeats a reference value (113.56) and must be skipped.
 * The real lower/middle/upper values are always in the ROW IMMEDIATELY BELOW the label.
 */
const findHeadTolerance = (rows, label) => {
    const l = label.toLowerCase();
    for (let r = 0; r < rows.length; r++) {
        const rowText = rows[r].map(c => String(c).toLowerCase()).join(" ");
        if (rowText.includes(l)) {
            const nextRow = rows[r + 1];               // skip label row, read from next row
            if (nextRow) {
                const nums = nextRow
                    .map(v => getNumberStrict(v))
                    .filter(n => n !== 0);

                if (nums.length >= 3) {
                    const sorted = [...nums].sort((a, b) => a - b);
                    return { lower: sorted[0], middle: sorted[1], upper: sorted[2] };
                } else if (nums.length === 2) {
                    const sorted = [...nums].sort((a, b) => a - b);
                    return { lower: sorted[0], middle: (sorted[0] + sorted[1]) / 2, upper: sorted[1] };
                } else if (nums.length === 1) {
                    return { lower: nums[0], middle: nums[0], upper: nums[0] };
                }
            }
        }
    }
    return { lower: 0, middle: 0, upper: 0 };
};

/**
 * EFFICIENCY / POWER TOLERANCE — Double (Lower, Upper)
 *
 * Confirmed Excel layout:
 *   Efficiency label row: [..., "Efficiency Tolerance", "", 77.9, 82, ...]      ← lower / upper
 *   Next row:             [...,                         "", 113.56, 113.56, ...]  ← reference, ignored
 *
 *   Power label row:      [..., "Power tolerance", "", 91.7125, 84.919, ...]    ← unsorted, needs sort
 *   Next row:             [...,                    "", 113.56,  113.56, ...]     ← reference, ignored
 *
 * The two values on the LABEL ROW are sorted to give lower and upper.
 */
const findDoubleTolerance = (rows, label) => {
    const l = label.toLowerCase();
    for (let r = 0; r < rows.length; r++) {
        const rowText = rows[r].map(c => String(c).toLowerCase()).join(" ");
        if (rowText.includes(l)) {
            const nums = rows[r]
                .map(v => getNumberStrict(v))
                .filter(n => n !== 0)
                .slice(0, 2);                          // first 2 non-zero numbers = lower / upper

            if (nums.length >= 2) {
                const sorted = [...nums].sort((a, b) => a - b);
                return { lower: sorted[0], upper: sorted[1] };
            } else if (nums.length === 1) {
                return { lower: nums[0], upper: nums[0] };
            }
        }
    }
    return { lower: 0, upper: 0 };
};

/**
 * Main Parsing Function
 */
const parseExcelData = (buffer) => {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

    // INITIALIZE DATA WITH DEFAULTS TO PREVENT EJS ERRORS
    const data = {
        company: { name: "", address: "" },
        documentDetails: {},
        pumpDetails: {},
        motorDetails: {},
        measurementReferences: {},
        testConditions: {},
        observations: [],
        ratedSpeedData: [],
        testSummary: {},
        representatives: {},
        tolerances: {
            acceptanceGrade: "",
            flow:       { lower: 0, middle: 0, upper: 0 },
            head:       { lower: 0, middle: 0, upper: 0 },
            efficiency: { lower: 0, upper: 0 },
            power:      { lower: 0, upper: 0 },
            overallToleranceStatus: ""
        },
        mechanicalTest: {
            vibration: {
                horizontalDE: 0, horizontalNDE: 0,
                verticalDE: 0,   verticalNDE: 0,
                axialDE: 0,      axialNDE: 0
            },
            bearingTemperature: { deC: 0, ndeC: 0 },
            leakage: {}
        }
    };

    // 1. RESULT SHEET PROCESSING
    const resultSheetName = workbook.SheetNames.find(n => n.match(/Test|Result|Sheet2/i));
    if (resultSheetName) {
        const sheet = workbook.Sheets[resultSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        data.company = {
            name: "Pumpsense Fluid Engineering Pvt. Ltd.",
            address: "5F Hastings Court, Kolkata-700023"
        };

        data.documentDetails = {
            documentNo:     smartFindVal(rows, "Doc"),
            testCode:       smartFindVal(rows, "Test Code"),
            toleranceGrade: smartFindVal(rows, "Acceptance Grade") || smartFindVal(rows, "Tolerance Grade"),
            reportNo:       smartFindVal(rows, "Report No"),
            testDate:       smartFindVal(rows, "Test Date:", "date"),
            testTime:       smartFindVal(rows, "Time", "time") || "",
            customerName:   smartFindVal(rows, "Customer:")
        };

        data.pumpDetails = {
            model:              smartFindVal(rows, "Pump Model"),
            serialNo:           smartFindVal(rows, "Pump Sl"),
            suctionSizeMm:      num(smartFindVal(rows, "Suction size")),
            deliverySizeMm:     num(smartFindVal(rows, "Del. size")),
            impellerDiameterMm: num(smartFindVal(rows, "Impeller dia")),
            impellerType:       smartFindVal(rows, "Type of Impeller")
        };

        data.motorDetails = {
            make:        smartFindVal(rows, "Motor make"),
            serialNo:    smartFindVal(rows, "Motor Sl"),
            ratingKW:    num(smartFindVal(rows, "Motor rating")),
            voltageV:    num(smartFindVal(rows, "Motor voltage")),
            phase:       smartFindVal(rows, "Phase"),
            frequencyHz: num(smartFindVal(rows, "Frequency")),
            speedRpm:    num(smartFindVal(rows, "Speed")),
            currentAmps: num(smartFindVal(rows, "Current")),
            frame:       smartFindVal(rows, "Frame")
        };

        data.measurementReferences = {
            capacityMeasuredBy:       smartFindText(rows, "capacity measured"),
            speedMeasuredBy:          smartFindText(rows, "speed measured"),
            suctionHeadMeasuredBy:    smartFindText(rows, "suction head measured"),
            deliveryHeadMeasuredBy:   smartFindText(rows, "delivery head measured"),
            powerMeasuredBy:          smartFindText(rows, "power measured"),
            motorEfficiencyReference: smartFindText(rows, "motor efficiency reference")
        };

        data.testConditions = {
            atmosphericPressureMbar: num(smartFindVal(rows, "Atmospheric pressure")),
            ambientTempC:            num(smartFindVal(rows, "Ambient Temp")),
            liquidTempC:             num(smartFindVal(rows, "Temperature of test liquid")),
            liquidSpecificGravity:   num(smartFindVal(rows, "Specific gravity")),
            npshAvailableM:          num(smartFindVal(rows, "NPSHa"))
        };

        // ── Tolerance Parsing ──────────────────────────────────────────────────
        // Flow      → label row has 3 values: lower(104.47), middle(113.56), upper(122.64)
        // Head      → label row has reference 113.56×3 (IGNORED); next row has lower(213.78), middle(225.04), upper(236.29)
        // Efficiency → label row has 2 values: lower(77.9), upper(82)
        // Power      → label row has 2 values (unsorted): sorted to lower(84.92), upper(91.71)
        data.tolerances.flow            = findFlowTolerance(rows, "flow tolerance");
        data.tolerances.head            = findHeadTolerance(rows, "head tolerance");
        data.tolerances.efficiency      = findDoubleTolerance(rows, "efficiency tolerance");
        data.tolerances.power           = findDoubleTolerance(rows, "power tolerance");
        data.tolerances.acceptanceGrade = data.documentDetails.toleranceGrade || "";

        // ── Observations ───────────────────────────────────────────────────────
        let ratedSectionStart = -1;
        rows.forEach((r, i) => {
            if (r.some(cell => typeof cell === "string" && cell.toLowerCase().includes("rated speed"))) {
                ratedSectionStart = i;
            }
        });

        rows.forEach((r, i) => {
            if (ratedSectionStart !== -1 && i >= ratedSectionStart) return;
            const rpm = parseFloat(r[1]);
            if (!isNaN(r[0]) && r[0] !== "" && rpm > 500 && rpm < 5000) {
                data.observations.push({
                    slNo:                      Number(r[0]),
                    pumpSpeedRpm:              num(r[1]),
                    suctionGaugeKgCm2:         num(r[2]),
                    deliveryGaugeKgCm2:        num(r[3]),
                    velocityHeadCorrectionM:   num(r[4]),
                    headLossIncreaserReducerM:  num(r[5]),
                    totalHeadM:                num(r[6]),
                    flowM3Hr:                  num(r[7]),
                    pumpOutputKW:              num(r[11]),
                    motorInputKW:              num(r[12]),
                    motorEfficiencyPercent:    num(r[13]),
                    pumpInputKW:               num(r[14]),
                    pumpEfficiencyPercent:     num(r[15])
                });
            }
        });

        // ── Rated Speed Data ───────────────────────────────────────────────────
        if (ratedSectionStart !== -1) {
            for (let i = ratedSectionStart + 3; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length < 6 || isNaN(r[0]) || r[0] === "") break;
                data.ratedSpeedData.push({
                    slNo:                  Number(r[0]),
                    totalHeadM:            num(r[1]),
                    flowM3Hr:              num(r[2]),
                    powerKW:               num(r[3]),
                    specificGravity:       num(r[4]),
                    pumpEfficiencyPercent: num(r[5]),
                    nearestDutyPoint:      false
                });
            }
            if (data.ratedSpeedData.length > 0) {
                const maxEff = Math.max(...data.ratedSpeedData.map(o => o.pumpEfficiencyPercent));
                data.ratedSpeedData.forEach(o => {
                    if (o.pumpEfficiencyPercent === maxEff) o.nearestDutyPoint = true;
                });
            }
        }

        // ── Test Summary ───────────────────────────────────────────────────────
        data.testSummary = {
            testStartedAt:               smartFindVal(rows, "Test Started", "time"),
            testEndedAt:                 smartFindVal(rows, "Test Ended", "time"),
            guaranteedTotalHeadM:        getNumberStrict(smartFindVal(rows, "Total Head :")),
            guaranteedDischargeM3Hr:     getNumberStrict(smartFindVal(rows, "Discharge :")),
            guaranteedEfficiencyPercent: getNumberStrict(smartFindVal(rows, "Efficiency :")),
            guaranteedPumpInputKW:       getNumberStrict(smartFindVal(rows, "Pump Input :")),
            guaranteedSpeedRpm:          getNumberStrict(smartFindVal(rows, "Speed :")),
            drivenThroughVFD:            String(smartFindVal(rows, "VFD") || "").toLowerCase().includes("vfd")
        };

        data.representatives = {
            customerAgency: smartFindVal(rows, "Customer / Agency") || "",
            manufacturer:   smartFindVal(rows, "Manufacturer") || ""
        };
    }

    // 2. MECHANICAL SHEET PROCESSING
    const mechSheetName = workbook.SheetNames.find(n => n.match(/mechanical/i));
    if (mechSheetName) {
        const sheet = workbook.Sheets[mechSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const findValInMech = (k) => {
            for (let r = 0; r < rows.length; r++) {
                if (String(rows[r][1] || "").toLowerCase().includes(k.toLowerCase())) return rows[r][3];
            }
            return null;
        };

        data.mechanicalTest.pumpSerialNo             = findValInMech("Pump serial No");
        data.mechanicalTest.modelName                = findValInMech("Model name");
        data.mechanicalTest.pumpType                 = findValInMech("Pump type");
        data.mechanicalTest.powerRating              = findValInMech("Power rating");
        data.mechanicalTest.freeRunningRotatingParts = findValInMech("Free-running");

        rows.forEach(row => {
            const label = String(row[1] || "").toLowerCase();
            if (label.includes("horizontal")) {
                data.mechanicalTest.vibration.horizontalDE  = parseFloat(row[2]) || 0;
                data.mechanicalTest.vibration.horizontalNDE = parseFloat(row[3]) || 0;
            }
            if (label.includes("vertical")) {
                data.mechanicalTest.vibration.verticalDE  = parseFloat(row[2]) || 0;
                data.mechanicalTest.vibration.verticalNDE = parseFloat(row[3]) || 0;
            }
            if (label.includes("axial")) {
                data.mechanicalTest.vibration.axialDE  = parseFloat(row[2]) || 0;
                data.mechanicalTest.vibration.axialNDE = parseFloat(row[3]) || 0;
            }
            if (label.includes("temperature at bearings")) {
                data.mechanicalTest.bearingTemperature = { deC: num(row[2]), ndeC: num(row[3]) };
            }
            if (label.includes("noise level"))    data.mechanicalTest.noiseLevelDBA                = String(row[3]);
            if (label.includes("engineer"))        data.mechanicalTest.testEngineerName              = row[3];
            if (label.includes("containment"))     data.mechanicalTest.leakage.pressureContainment   = String(row[3]).toUpperCase();
            if (label.includes("gasket"))          data.mechanicalTest.leakage.gasket                = String(row[3]).toUpperCase();
            if (label.includes("piping"))          data.mechanicalTest.leakage.mechanicalSealPiping  = String(row[3]).toUpperCase();
            if (label.includes("packing"))         data.mechanicalTest.leakage.packingsOrSeal        = String(row[3]);
            if (label.includes("bearing housing")) data.mechanicalTest.leakage.bearingHousing        = String(row[3]).toUpperCase();
        });
    }

    return data;
};

module.exports = { parseExcelData };