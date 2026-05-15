const mongoose = require('mongoose');

const observationSchema = new mongoose.Schema({
  slNo: Number,
  pumpSpeedRpm: Number,
  suctionGaugeKgCm2: Number,
  deliveryGaugeKgCm2: Number,
  velocityHeadCorrectionM: Number,
  headLossIncreaserReducerM: Number,
  totalHeadM: Number,
  flowM3Hr: Number,
  pumpOutputKW: Number,
  motorInputKW: Number,
  motorEfficiencyPercent: Number,
  pumpInputKW: Number,
  pumpEfficiencyPercent: Number
}, { _id: false });

const ratedSpeedSchema = new mongoose.Schema({
  slNo: Number,
  totalHeadM: Number,
  flowM3Hr: Number,
  powerKW: Number,
  specificGravity: Number,
  pumpEfficiencyPercent: Number,
  nearestDutyPoint: { type: Boolean, default: false }
}, { _id: false });

const vibrationSchema = new mongoose.Schema({
  axialDE: Number,
  axialNDE: Number,
  verticalDE: Number,
  verticalNDE: Number,
  horizontalDE: Number,
  horizontalNDE: Number,
  maxAllowableDE: Number,
  maxAllowableNDE: Number
}, { _id: false });

const leakageSchema = new mongoose.Schema({
  pressureContainment: { type: String, enum: ["YES", "NO"] },
  gasket: { type: String, enum: ["YES", "NO"] },
  mechanicalSealPiping: { type: String, enum: ["YES", "NO"] },
  packingsOrSeal: { type: String },
  bearingHousing: { type: String, enum: ["YES", "NO"] }
}, { _id: false });

const PumpTestSchema = new mongoose.Schema({
  company: {
    name: String,
    address: String
  },

  documentDetails: {
    documentNo: String,
    testCode: String,
    toleranceGrade: String,
    reportNo: String,
    testDate: Date,
    testTime: String,
    customerName: String
  },

  pumpDetails: {
    model: String,
    serialNo: String,
    suctionSizeMm: Number,
    deliverySizeMm: Number,
    impellerDiameterMm: Number,
    impellerType: String
  },

  motorDetails: {
    make: String,
    serialNo: String,
    ratingKW: Number,
    voltageV: Number,
    phase: String,
    frequencyHz: Number,
    speedRpm: Number,
    currentAmps: Number,
    frame: String
  },

  measurementReferences: {
    capacityMeasuredBy: String,
    speedMeasuredBy: String,
    suctionHeadMeasuredBy: String,
    deliveryHeadMeasuredBy: String,
    powerMeasuredBy: String,
    motorEfficiencyReference: String
  },

  testConditions: {
    atmosphericPressureMbar: Number,
    ambientTempC: Number,
    liquidTempC: Number,
    liquidSpecificGravity: Number,
    npshAvailableM: Number
  },

  observations: [observationSchema],

  ratedSpeedData: [ratedSpeedSchema],

  testSummary: {
    testStartedAt: String,
    testEndedAt: String,
    guaranteedTotalHeadM: String,
    guaranteedDischargeM3Hr: String,
    guaranteedEfficiencyPercent: String,
    guaranteedPumpInputKW: String,
    guaranteedSpeedRpm: String,
    drivenThroughVFD: String
  },

  representatives: {
    customerAgency: String,
    manufacturer: String
  },

  tolerances: {
    acceptanceGrade: String,
    flow: {
      upper: Number,
      middle: Number,
      lower: Number
    },
    head: {
      upper: Number,
      middle: Number,
      lower: Number
    },
    efficiency: {
      upper: Number,
      lower: Number
    },
    power: {
      upper: Number,
      lower: Number
    },
    overallToleranceStatus: String
  },

  mechanicalTest: {
    pumpSerialNo: String,
    modelName: String,
    pumpType: String,
    powerRating: String,
    vibration: vibrationSchema,
    bearingTemperature: {
      deC: Number,
      ndeC: Number
    },
    noiseLevelDBA: String,
    leakage: leakageSchema,
    freeRunningRotatingParts: { type: String },
    testEngineerName: String
  }

// ✅ REMOVED { _id: false } here — PumpTestSchema is embedded, not a root model,
//    but removing it ensures MongoDB correctly assigns _id when used as subdocument
});

const PumpTestComparisonSchema = new mongoose.Schema({
  uploadDate: {
    type: Date,
    default: Date.now
  },
  trueData: {
    type: PumpTestSchema
  },
  alteredData: {
    type: PumpTestSchema
  }
}, {
  timestamps: true,
  collection: 'pump_test_comparisons2'
});



module.exports = mongoose.model('PumpTestComparison', PumpTestComparisonSchema);