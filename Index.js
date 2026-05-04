const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const bcrypt = require('bcrypt');
const { 
    express, path, mongoose, 
    passport, LocalStrategy, session, flash, upload,
    models, utils, rbac 
} = require("./Middleware/Config");

const app = express();
const { User, PumpTestComparison, Design } = models;
const { ROLES, MASTER_LIST, REPORT_TEAM_LIST, DESIGN_TEAM_LIST } = rbac;

/**
 * GLOBAL CONSTANTS FOR EJS
 */
app.locals.logoUrl = "https://undertaker099.s3.ap-south-1.amazonaws.com/Pumpsense-Fluid-Engineering-Home-__1_.png";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// View Engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Session & Flash
app.use(session({
    secret: 'pumpsense_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(flash());

// Passport Config
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        // Normalize username (case-insensitive search)
        const normalizedUsername = username.toLowerCase().trim();
        const user = await User.findOne({ username: normalizedUsername });
        
        if (!user) {
            return done(null, false, { message: 'User not found.' });
        }
        
        // Use the schema method or direct bcrypt comparison
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return done(null, false, { message: 'Invalid credentials.' });
        }
        
        return done(null, user);
    } catch (err) { 
        return done(err); 
    }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try { 
        const user = await User.findById(id); 
        done(null, user); 
    } catch (err) { 
        done(err); 
    }
});

// --- RBAC Middlewares ---

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
}

function authorize(allowedRoles = []) {
    return (req, res, next) => {
        if (!req.isAuthenticated()) return res.redirect('/login');
        if (allowedRoles.includes(req.user.role)) return next();
        
        res.status(403).render("Autherror", { 
            user: req.user,
            requiredRoles: allowedRoles,
            path: req.originalUrl
        });
    };
}

// --- Auth Routes ---

app.get("/login", (req, res) => {
    if (req.isAuthenticated()) return res.redirect('/view-files');
    res.render("Login", { 
        message: req.flash('error'), 
        success: req.flash('success') 
    });
});

app.post("/login", passport.authenticate('local', {
    successRedirect: '/view-files',
    failureRedirect: '/login',
    failureFlash: true
}));

app.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/login');
    });
});

app.post("/register", async (req, res) => {
    try {
        let { username, password, confirmPassword } = req.body;
        username = username.toLowerCase().trim();

        if (password !== confirmPassword) { 
            req.flash('error', 'Passwords do not match.'); 
            return res.redirect('/login'); 
        }
        
        const existing = await User.findOne({ username });
        if (existing) { 
            req.flash('error', 'Username/Email already registered.'); 
            return res.redirect('/login'); 
        }
        
        // RBAC logic based on whitelist
        let assignedRole = ROLES.USER; 
        if (MASTER_LIST.includes(username)) assignedRole = ROLES.MASTER;
        else if (REPORT_TEAM_LIST.includes(username)) assignedRole = ROLES.REPORT_TEAM;
        else if (DESIGN_TEAM_LIST.includes(username)) assignedRole = ROLES.DESIGN_TEAM;
        
        // FIX: Pass the plain password. The UserSchema pre-save hook handles hashing.
        // Doing it here AND in the schema causes "double hashing" which breaks login.
        await User.create({ 
            username, 
            password, 
            role: assignedRole 
        });
        
        req.flash('success', `Account created successfully as ${assignedRole}!`);
        res.redirect('/login');
    } catch (error) { 
        console.error("Registration Error:", error);
        req.flash('error', 'An error occurred during registration.');
        res.redirect('/login'); 
    }
});

// --- User Management (MASTER ONLY) ---

app.get("/manage-users", authorize([ROLES.MASTER]), async (req, res) => {
    try {
        const allUsers = await User.find({ username: { $exists: true, $ne: null } }).sort({ username: 1 });
        res.render("Manage", { 
            users: allUsers, 
            currentUser: req.user, 
            availableRoles: Object.values(ROLES),
            success: req.flash('success'),
            error: req.flash('error')
        });
    } catch (error) {
        res.status(500).send("Error fetching users.");
    }
});

app.post("/update-user-role/:id", authorize([ROLES.MASTER]), async (req, res) => {
    try {
        const { role } = req.body;
        if (!Object.values(ROLES).includes(role)) {
            req.flash('error', 'Invalid role selected.');
            return res.redirect('/manage-users');
        }

        if (req.user._id.toString() === req.params.id && role !== ROLES.MASTER) {
            req.flash('error', 'Safety: You cannot downgrade your own Master access.');
            return res.redirect('/manage-users');
        }

        await User.findByIdAndUpdate(req.params.id, { role });
        req.flash('success', 'User role updated successfully.');
        res.redirect('/manage-users');
    } catch (error) {
        req.flash('error', 'Failed to update role.');
        res.redirect('/manage-users');
    }
});

app.post("/delete-user/:id", authorize([ROLES.MASTER]), async (req, res) => {
    try {
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({ success: false, message: "Self-deletion prohibited." });
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// --- Application Logic ---

app.get("/", ensureAuthenticated, (req, res) => res.redirect('/view-files'));

app.get("/view-files", ensureAuthenticated, async (req, res) => {
    try {
        const allFiles = await PumpTestComparison.find({}).sort({ uploadDate: -1 }); 
        const allDesigns = await Design.find({}).sort({ createdAt: -1 });
        res.render("Table", { files: allFiles, designs: allDesigns, user: req.user });
    } catch (error) { res.status(500).send("Dashboard error."); }
});

// --- Performance Report Management ---

app.get("/upload", authorize([ROLES.MASTER, ROLES.REPORT_TEAM]), (req, res) => {
    res.render("Upload", { user: req.user });
});

app.post("/upload", authorize([ROLES.MASTER, ROLES.REPORT_TEAM]), upload.array("file", 2), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) return res.status(400).send("True file is mandatory.");
        
        const trueDataRaw = utils.parseExcelData(req.files[0].buffer);
        let alteredFileData = null;
        let alteredDataRaw = null;

        if (req.files[1]) {
            alteredFileData = { filename: req.files[1].originalname };
            alteredDataRaw = utils.parseExcelData(req.files[1].buffer);
        }

        await PumpTestComparison.create({
            uploadDate: new Date(),
            trueFile: { filename: req.files[0].originalname },
            alteredFile: alteredFileData,
            trueData: trueDataRaw,
            alteredData: alteredDataRaw,
            uploadedBy: req.user._id
        });
        
        res.redirect(`/view-files`);
    } catch (error) { 
        console.error("Upload Error:", error);
        res.status(500).send("Upload failed."); 
    }
});

app.post("/delete-report/:id", authorize([ROLES.MASTER, ROLES.REPORT_TEAM]), async (req, res) => {
    try {
        await PumpTestComparison.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.get('/report/:id', ensureAuthenticated, async (req, res) => {
    try {
        const report = await PumpTestComparison.findById(req.params.id);
        if (!report) return res.status(404).send("Report not found");
        
        const pumpModel = report.trueData.pumpDetails.model;
        const design = await Design.findOne({ 
            pumpModel: { $regex: new RegExp(`^${pumpModel.trim()}$`, "i") } 
        });
        
        res.render('Report', { report, design, user: req.user });
    } catch (err) { 
        console.error(err);
        res.status(500).send("Error loading report."); 
    }
});

// --- Design Specification Management ---

app.get("/upload-design", authorize([ROLES.MASTER, ROLES.DESIGN_TEAM, ROLES.REPORT_TEAM]), (req, res) => {
    res.render("Design", { user: req.user, message: req.flash('error'), design: undefined });
});

app.post("/upload-design", authorize([ROLES.MASTER, ROLES.DESIGN_TEAM, ROLES.REPORT_TEAM]), async (req, res) => {
    try {
        const { pumpModel, serialNo, discharge, power, efficiency, totalHead } = req.body;
        
        const existing = await Design.findOne({ 
            pumpModel: pumpModel.trim(), 
            serialNo: serialNo.trim() 
        });

        if (existing) { 
            req.flash('error', `Entry for Model ${pumpModel} / Serial ${serialNo} already exists.`); 
            return res.redirect('/upload-design'); 
        }

        await Design.create({ 
            pumpModel: pumpModel.trim(), 
            serialNo: serialNo.trim(), 
            discharge, power, efficiency, totalHead, 
            createdBy: req.user._id 
        });
        
        req.flash('success', 'Design specification added.');
        res.redirect('/view-files');
    } catch (error) { 
        console.error("Design Create Error:", error);
        res.redirect('/upload-design'); 
    }
});

app.get("/edit-design/:id", authorize([ROLES.MASTER, ROLES.DESIGN_TEAM, ROLES.REPORT_TEAM]), async (req, res) => {
    try {
        const design = await Design.findById(req.params.id);
        if (!design) return res.status(404).send("Design not found");
        res.render("Design", { user: req.user, design, message: req.flash('error') });
    } catch (error) { res.status(500).send("Error loading design."); }
});

app.post("/update-design/:id", authorize([ROLES.MASTER, ROLES.DESIGN_TEAM, ROLES.REPORT_TEAM]), async (req, res) => {
    try {
        const { pumpModel, serialNo } = req.body;

        const collision = await Design.findOne({
            _id: { $ne: req.params.id },
            pumpModel: pumpModel.trim(),
            serialNo: serialNo.trim()
        });

        if (collision) {
            req.flash('error', `Cannot update: Model/Serial combination already in use.`);
            return res.redirect(`/edit-design/${req.params.id}`);
        }

        await Design.findByIdAndUpdate(req.params.id, req.body);
        req.flash('success', 'Design specification updated.');
        res.redirect('/view-files');
    } catch (error) { 
        res.redirect(`/edit-design/${req.params.id}`); 
    }
});

app.post("/delete-design/:id", authorize([ROLES.MASTER, ROLES.DESIGN_TEAM, ROLES.REPORT_TEAM]), async (req, res) => {
    try {
        await Design.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) { res.status(500).json({ success: false }); }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PUMPSENSE Server running on port ${PORT}`));