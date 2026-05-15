// Load environment variables
require("dotenv").config();

// Standard Libraries
const express = require("express");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");

// Passport & Auth
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const flash = require('connect-flash');

// Models & Middleware
const PumpTestComparison = require("./DATABASE/Report"); 
const User = require("./DATABASE/Credential"); 
const Design = require("./DATABASE/Design"); 
const { parseExcelData } = require("./Excelparser");

/**
 * 1. MULTER CONFIGURATION
 * Using memory storage so files are accessible via req.files[i].buffer
 */
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * 2. RBAC CONSTANTS
 */
const ROLES = {
    MASTER: 'MASTER',
    REPORT_TEAM: 'REPORT TEAM',
    DESIGN_TEAM: 'DESIGN TEAM',
    USER: 'USER'
};

const MASTER_LIST = (process.env.MASTER_LIST || "").toLowerCase().split(",").map(i => i.trim());
const REPORT_TEAM_LIST = (process.env.REPORT_TEAM_LIST || "").toLowerCase().split(",").map(i => i.trim());
const DESIGN_TEAM_LIST = (process.env.DESIGN_TEAM_LIST || "").toLowerCase().split(",").map(i => i.trim());

module.exports = {
    express, 
    path, 
    mongoose, 
    passport, 
    LocalStrategy, 
    session, 
    flash, 
    upload,
    models: { PumpTestComparison, User, Design },
    utils: { parseExcelData },
    rbac: { ROLES, MASTER_LIST, REPORT_TEAM_LIST, DESIGN_TEAM_LIST }
};