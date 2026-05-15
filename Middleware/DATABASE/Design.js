require("dotenv").config();
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_LINK)
  .then(async () => {
    console.log("Mongodb Connected");
    
    try {
      const collection = mongoose.connection.db.collection('designs');
      const indexes = await collection.indexes();

      // Silently drop the problematic old index if it exists
      // Removed the 'else' console log to stop the terminal noise
      if (indexes.find(i => i.name === 'serialNo_1')) {
        await collection.dropIndex('serialNo_1');
      }

    } catch (err) {
      // Only log actual execution errors, not missing indexes
      if (err.codeName !== 'IndexNotFound') {
        console.error("Database Cleanup Error:", err.message);
      }
    }
  })
  .catch((error) => console.log("Connection Error:", error));

const pumpSchema = new mongoose.Schema({
  // Identification
  pumpModel: {
    type: String,
    required: [true, 'Pump Model is required'],
    trim: true,
    index: true
  },
  serialNo: {
    type: String,
    required: [true, 'Serial Number is required'],
    trim: true
  },

  // Performance Metrics
  discharge: {
    type: Number, 
    required: [true, 'Discharge value is required'],
    min: [0, 'Discharge cannot be negative']
  },
  power: {
    type: Number, 
    required: [true, 'Power consumption is required'],
    min: [0, 'Power cannot be negative']
  },
  efficiency: {
    type: Number, 
    required: [true, 'Efficiency percentage is required'],
    min: [0, 'Efficiency cannot be less than 0%'],
    max: [100, 'Efficiency cannot exceed 100%']
  },
  totalHead: {
    type: Number, 
    required: [true, 'Total Head is required'],
    min: [0, 'Total Head cannot be negative']
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * COMPOUND UNIQUE INDEX
 * Allows the same serialNo to exist for DIFFERENT pumpModels.
 */
pumpSchema.index({ pumpModel: 1, serialNo: 1 }, { unique: true });

// Export the model
module.exports = mongoose.model('Design', pumpSchema);