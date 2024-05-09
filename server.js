const express = require('express');
const app = express();
const axios = require('axios');
const path = require('path');
const argon2 = require('argon2');
const pool = require('./db-connector');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // Add this at the top of your file
const jobs = {};


app.use(flash());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Add this line to parse URL-encoded bodies
app.use(express.static(path.join(__dirname, './frontend/src'))); // Serve static files
app.set('views', path.join(__dirname, './frontend/src/views')); // Set views directory
app.set('view engine', 'ejs');

app.use(session({
  secret: 'your secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Note: secure should be set to true when in production
}));

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

// Set up multer to store files in disk storage with a file size limit
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
    }
});

// LOG IN ROUTES AND HANDLERS

// Route for landing page
app.get('/', (req, res) => {
    res.render('landing');
});

// Route for Teacher login page
app.get('/login/teacher', (req, res) => {
    res.render('login_teacher');
});

// Log in a teacher
app.post('/login/teacher', (req, res) => {
    const { email, password } = req.body;

    // Retrieve the teacher with the given email
    pool.query('SELECT * FROM Teacher WHERE email = ?', [email], async (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const user = results[0];

            // Check if the given password matches the one stored in the database
            if (await argon2.verify(user.password, password)) {
                // The passwords match, log the user in
                req.session.userId = user.id;
                res.redirect('/teacher/homepage');
            } else {
                // The passwords do not match
                res.status(401).json({ message: 'Incorrect password.' });
            }
        } else {
            // No teacher with the given email exists
            res.status(404).json({ message: 'No account with this email exists.' });
        }
    });
});


// Route for student login page
app.get('/login/student', (req, res) => {
    res.render('login_student');
});

// Log in a student
app.post('/login/student', (req, res) => {
    const { email, password } = req.body;

    // Retrieve the student with the given email
    pool.query('SELECT * FROM Student WHERE email = ?', [email], async (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const user = results[0];

            // Check if the given password matches the one stored in the database
            if (await argon2.verify(user.password, password)) {
                // The passwords match, log the user in
                req.session.userId = user.id;
                res.redirect('/student/homepage');
            } else {
                // The passwords do not match
                res.status(401).json({ message: 'Incorrect password.' });
            }
        } else {
            // No student with the given email exists
            res.status(404).json({ message: 'No account with this email exists.' });
        }
    });
});

// Route for register page to create an account
app.get('/login/register', (req, res) => {
    res.render('register');
});

// Register a new user
app.post('/login/register', async (req, res) => {
    const { accountType, name, email, password } = req.body;

    // Check if an account with the given email already exists
    pool.query('SELECT * FROM Teacher WHERE email = ? UNION SELECT * FROM Student WHERE email = ?', [email, email], async (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            // An account with the given email already exists
            res.status(400).json({ message: 'An account with this email already exists.' });
        } else {
            // Hash the password
            const hashedPassword = await argon2.hash(password);

            // Handle registration
            if (accountType === 'teacher') {
                // Insert data into the teachers table
                pool.query('INSERT INTO Teacher (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword], (error, results) => {
                    if (error) throw error;
                    // Handle results here
                    console.log(`Inserted row with ID ${results.insertId}`);
                    req.session.userId = results.insertId; // Store the user's ID in the session
                    res.redirect('/teacher/homepage'); // Redirect to the teacher's homepage
                });
            } else if (accountType === 'student') {
                // Insert data into the students table
                pool.query('INSERT INTO Student (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword], (error, results) => {
                    if (error) throw error;
                    // Handle results here
                    console.log(`Inserted row with ID ${results.insertId}`);
                    req.session.userId = results.insertId; // Store the user's ID in the session
                    res.redirect('/student/homepage'); // Redirect to the teacher's homepage
                });
            } else {
                // Handle invalid account type
                console.log('Invalid account type provided.');
                console.log(req.body);
                console.log(accountType)
                res.status(400).json({ message: 'Invalid account type provided.' });
            }
        }
    });
});







// TEACHER HOMEPAGE AND CLASSROOM ROUTES AND HANDLERS

// Route for Teacher Account Homepage
app.get('/teacher/homepage', (req, res) => {
    pool.query('SELECT * FROM Teacher WHERE id = ?', [req.session.userId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const user = results[0];
            pool.query('SELECT * FROM Classroom WHERE teacher_id = ?', [req.session.userId], (error, results) => {
                if (error) throw error;
                const classrooms = results;
                res.render('teacher_homepage', { user, classrooms }); // Pass the user's data and classrooms to the teacher_homepage.ejs file
            });
        } else {
            res.status(404).send('User not found');
        }
    });
});

// Route for Creating A Claassroom
app.get('/Teacher/Classroom/Create', (req, res) => {
    res.render('create_classroom');
});

// Function that generates an invite code for a classroom
function generateInviteCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let inviteCode = '';
    for (let i = 0; i < 7; i++) {
        inviteCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return inviteCode;
}

// Create a new classroom
app.post('/Teacher/Classroom/Create', async (req, res) => {
    const { name } = req.body;
    const teacher_id = req.session.userId;

    while (true) {
        const invite_code = generateInviteCode();

        try {
            await pool.query('INSERT INTO Classroom (name, teacher_id, invite_code) VALUES (?, ?, ?)', [name, teacher_id, invite_code]);
            // If the insert operation was successful, break out of the loop
            break;
        } catch (error) {
            // If the insert operation failed because the invite code already exists, continue the loop to generate a new invite code
            if (error.code === 'ER_DUP_ENTRY') continue;
            // If the error was caused by something else, throw the error
            throw error;
        }
    }

    res.redirect('/teacher/homepage');
});

// Display The classrooms Homepage
app.get('/Teacher/classroom/:invite_code', (req, res) => {
    const invite_code = req.params.invite_code;
    const teacher_id = req.session.userId;

    // Check if the user is the teacher of the classroom
    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [invite_code], (error, classrooms) => {
        if (error) {
            console.error(error);
            res.status(500).send('An error occurred while trying to fetch the classroom data.');
            return;
        }

        // console.log(classrooms); // Log the classrooms to the console

        if (classrooms.length > 0 && classrooms[0].teacher_id === teacher_id) {
            const classroom_id = classrooms[0].id;

            // The user is the teacher of the classroom, fetch the teacher's name
            pool.query('SELECT name FROM Teacher WHERE id = ?', [teacher_id], (error, teachers) => {
                if (error) {
                    console.error(error);
                    res.status(500).send('An error occurred while trying to fetch the teacher data.');
                    return;
                }

                // Fetch the students in the classroom
                pool.query('SELECT Student.* FROM Student JOIN ClassroomStudent ON Student.id = ClassroomStudent.student_id WHERE ClassroomStudent.classroom_id = ?', [classroom_id], (error, students) => {
                    if (error) {
                        console.error(error);
                        res.status(500).send('An error occurred while trying to fetch the students data.');
                        return;
                    }

                    // Fetch the assignments for the classroom
                    pool.query('SELECT * FROM Assignment WHERE classroom_id = ?', [classroom_id], (error, assignments) => {
                        if (error) {
                            console.error(error);
                            res.status(500).send('An error occurred while trying to fetch the assignments data.');
                            return;
                        }

                        // Render the classroom homepage with the classroom, teacher, students, and assignments data
                        res.render('teacher_classroom_homepage', { classroom: classrooms[0], teacher: teachers[0], students, assignments });
                    });
                });
            });
        } else {
            // The user is not the teacher of the classroom, send an error message and redirect to the teacher homepage
            req.flash('error', 'You are not the teacher of this classroom.');
            res.redirect('/Teacher/homepage');
        }
    });
});

// Route for Teacher Assignment Overview Page
app.get('/Teacher/classroom/:invite_code/assignment/:id', (req, res) => {
    const invite_code = req.params.invite_code;
    const assignment_id = req.params.id;
    const teacher_id = req.session.userId;

    // Check if the user is the teacher of the classroom
    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [invite_code], (error, classrooms) => {
        if (error) {
            console.error(error);
            res.status(500).send('An error occurred while trying to fetch the classroom data.');
            return;
        }

        if (classrooms.length > 0 && classrooms[0].teacher_id === teacher_id) {
            const classroom_id = classrooms[0].id;

            // Check if the assignment belongs to the classroom
            pool.query('SELECT * FROM Assignment WHERE id = ? AND classroom_id = ?', [assignment_id, classroom_id], (error, assignments) => {
                if (error) {
                    console.error(error);
                    res.status(500).send('An error occurred while trying to fetch the assignment data.');
                    return;
                }

                if (assignments.length > 0) {
                    // Fetch the students in the classroom
                    pool.query('SELECT Student.* FROM Student JOIN ClassroomStudent ON Student.id = ClassroomStudent.student_id WHERE ClassroomStudent.classroom_id = ?', [classroom_id], (error, students) => {
                        if (error) {
                            console.error(error);
                            res.status(500).send('An error occurred while trying to fetch the students data.');
                            return;
                        }

                        // Fetch the student responses for the assignment
                        pool.query('SELECT StudentResponse.* FROM StudentResponse WHERE assignment_id = ?', [assignment_id], (error, responses) => {
                            if (error) {
                                console.error(error);
                                res.status(500).send('An error occurred while trying to fetch the student responses data.');
                                return;
                            }

                            // Fetch the completed assignments for the assignment along with the student's information
                            pool.query(`
                                SELECT CompletedAssignments.*, Student.name 
                                FROM CompletedAssignments 
                                JOIN Student ON CompletedAssignments.student_id = Student.id 
                                WHERE assignment_id = ?`, 
                                [assignment_id], 
                                (error, completedAssignments) => {
                                    if (error) {
                                        console.error(error);
                                        res.status(500).send('An error occurred while trying to fetch the completed assignments data.');
                                        return;
                                    }

                                    // Render the assignment overview page with the assignment, students, responses, and completed assignments data
                                    res.render('teacher_assignment_overview', { classroom: classrooms[0], assignment: assignments[0], students, responses, completedAssignments });
                                }
                            );
                        });
                    });
                } else {
                    // The assignment does not belong to the classroom, redirect to the teacher homepage
                    req.flash('error', 'The assignment does not belong to this classroom.');
                    res.redirect('/Teacher/homepage');
                }
            });
        } else {
            // The user is not the teacher of the classroom, redirect to the teacher homepage
            req.flash('error', 'You are not the teacher of this classroom.');
            res.redirect('/Teacher/homepage');
        }
    });
});

// Route for Teacher to view Student Assignment Feedback Page
app.get('/Teacher/classroom/:invite_code/assignment/:id/student_results/:student_id', (req, res) => {
    const invite_code = req.params.invite_code;
    const assignment_id = req.params.id;
    const student_id = req.params.student_id; // Use student_id instead of student_name
    const teacher_id = req.session.userId;

    // Check if the teacher and assignment belong to the classroom
    pool.query(`
        SELECT * 
        FROM Classroom 
        JOIN Assignment ON Classroom.id = Assignment.classroom_id 
        WHERE Classroom.invite_code = ? 
        AND Assignment.id = ?`, 
        [invite_code, assignment_id], 
        (error, results) => {
            if (error) throw error;
            if (results.length > 0 && results[0].teacher_id === teacher_id) {
                const classroom = results[0];
                const assignment = results[0];

                // Fetch the student's data
                pool.query(`
                    SELECT * 
                    FROM Student 
                    WHERE id = ?`, 
                    [student_id], 
                    (error, studentResults) => {
                        if (error) throw error;
                        const student = studentResults[0];

                        // Fetch the questions, student responses, and feedback for the assignment
                        pool.query(`
                            SELECT Question.*, StudentResponse.student_answer, StudentResponse.feedback 
                            FROM Question 
                            JOIN StudentResponse ON Question.id = StudentResponse.question_id 
                            WHERE Question.assignment_id = ? AND StudentResponse.student_id = ?`, 
                            [assignment_id, student.id], 
                            (error, questions) => {
                                if (error) throw error;

                                // Fetch the correctness percentage and completion date for the assignment
                                pool.query(`
                                    SELECT correctness_percentage, completion_date 
                                    FROM CompletedAssignments 
                                    WHERE student_id = ? AND assignment_id = ?`, 
                                    [student.id, assignment_id], 
                                    (error, results) => {
                                        if (error) throw error;
                                        const correctnessPercentage = results[0].correctness_percentage;
                                        const completionDate = results[0].completion_date;

                                        // Render the assignment feedback page with the assignment, questions, correctness percentage, completion date, and student data
                                        res.render('teacher_student_assignment_feedback', { classroom, assignment, questions, correctnessPercentage, completionDate, student });
                                    }
                                );
                            }
                        );
                    }
                );
            } else {
                // The teacher or assignment does not belong to the classroom, redirect to the teacher homepage
                res.redirect('/Teacher/homepage');
            }
        }
    );
});










// STUDENT HOMEPAGE AND CLASSROOM ROUTES AND HANDELERS

// Route for Student Account Homepage
app.get('/student/homepage', (req, res) => {
    pool.query('SELECT * FROM Student WHERE id = ?', [req.session.userId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const user = results[0];
            pool.query('SELECT Classroom.* FROM Classroom JOIN ClassroomStudent ON Classroom.id = ClassroomStudent.classroom_id WHERE ClassroomStudent.student_id = ?', [req.session.userId], (error, results) => {
                if (error) throw error;
                const classrooms = results;
                res.render('student_homepage', { user, classrooms }); // Pass the user's data and classrooms to the student_homepage.ejs file
            });
        } else {
            res.status(404).send('User not found');
        }
    });
});

// Route for Student Joining A Classroom
app.get('/student/classroom/join', (req, res) => {
    res.render('student_join_classroom');
});

// Student Joining A classroom
app.post('/student/classroom/join', (req, res) => {
    const inviteCode = req.body['invite-code'];

    // Retrieve the classroom with the given invite code
    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [inviteCode], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const classroom = results[0];

            // Check if the student is already a member of the classroom
            pool.query('SELECT * FROM ClassroomStudent WHERE student_id = ? AND classroom_id = ?', [req.session.userId, classroom.id], (error, results) => {
                if (error) throw error;
                if (results.length > 0) {
                    // The student is already a member of the classroom, redirect to the homepage
                    res.redirect('/student/homepage');
                } else {
                    // The student is not a member of the classroom, add them to the classroom
                    pool.query('INSERT INTO ClassroomStudent (student_id, classroom_id) VALUES (?, ?)', [req.session.userId, classroom.id], (error, results) => {
                        if (error) throw error;
                        // Redirect to the homepage after successfully joining the classroom
                        res.redirect('/student/homepage');
                    });
                }
            });
        } else {
            // No classroom with the given invite code exists, reload the join page
            res.redirect('/student/classroom/join');
        }
    });
});

// student_classroom_homepage.ejs
// Route for Student Classroom Homepage
app.get('/student/classroom/:invite_code', (req, res) => {
    const invite_code = req.params.invite_code;
    const student_id = req.session.userId;

    // Check if the student is a member of the classroom
    pool.query('SELECT * FROM Classroom JOIN ClassroomStudent ON Classroom.id = ClassroomStudent.classroom_id WHERE Classroom.invite_code = ? AND ClassroomStudent.student_id = ?', [invite_code, student_id], (error, classrooms) => {
        if (error) throw error;
        if (classrooms.length > 0) {
            const classroom = classrooms[0];

            // Fetch the teacher's name
            pool.query('SELECT name FROM Teacher WHERE id = ?', [classroom.teacher_id], (error, teachers) => {
                if (error) throw error;

                // Fetch the assignments for the classroom
                pool.query('SELECT * FROM Assignment WHERE classroom_id = ?', [classroom.id], (error, assignments) => {
                    if (error) throw error;

                    // Fetch the completed assignments for the student
                    pool.query('SELECT * FROM CompletedAssignments WHERE student_id = ?', [student_id], (error, completedAssignments) => {
                        if (error) throw error;

                        // Separate the assignments into completed and not completed
                        const completedAssignmentIds = completedAssignments.map(a => a.assignment_id);
                        const completed = assignments.filter(a => completedAssignmentIds.includes(a.id)).map(assignment => {
                            const completedAssignment = completedAssignments.find(a => a.assignment_id === assignment.id);
                            return {
                                ...assignment,
                                correctness_percentage: completedAssignment.correctness_percentage,
                                completion_date: completedAssignment.completion_date
                            };
                        });
                        const notCompleted = assignments.filter(a => !completedAssignmentIds.includes(a.id));

                        // Render the classroom homepage with the classroom, teacher, and assignments data
                        res.render('student_classroom_homepage', { classroom, teacher: teachers[0], completed, notCompleted });
                    });
                });
            });
        } else {
            // The student is not a member of the classroom, redirect to the student homepage
            res.redirect('/student/homepage');
        }
    });
});


// Route for Student Assignment Page
app.get('/student/classroom/:invite_code/assignment/:id', (req, res) => {
    const invite_code = req.params.invite_code;
    const assignment_id = req.params.id;
    const student_id = req.session.userId;

    // Check if the student and assignment belong to the classroom
    pool.query(`
        SELECT * 
        FROM Classroom 
        JOIN ClassroomStudent ON Classroom.id = ClassroomStudent.classroom_id 
        JOIN Assignment ON Classroom.id = Assignment.classroom_id 
        WHERE Classroom.invite_code = ? 
        AND ClassroomStudent.student_id = ? 
        AND Assignment.id = ?`, 
        [invite_code, student_id, assignment_id], 
        (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                const classroom = results[0];

                // Fetch the questions for the assignment
                pool.query('SELECT * FROM Question WHERE assignment_id = ?', [assignment_id], (error, questions) => {
                    if (error) throw error;

                    // Render the assignment page with the assignment and questions data
                    res.render('student_assignment', { classroom, assignment: results[0], questions });
                });
            } else {
                // The student or assignment does not belong to the classroom, redirect to the student homepage
                res.redirect('/student/homepage');
            }
        }
    );
});


// Student Answers an assignment
app.post('/student/classroom/:invite_code/assignment/:id', async (req, res) => {
    const invite_code = req.params.invite_code;
    const assignment_id = req.params.id;
    const student_id = req.session.userId;
    const student_answers = req.body;

    // Fetch the questions for the assignment
    pool.query('SELECT * FROM Question WHERE assignment_id = ?', [assignment_id], (error, questions) => {
        if (error) {
            console.error(error);
            res.status(500).send('An error occurred while fetching the questions.');
            return;
        }

        // Create the qa_pairs and student_responses dictionaries
        const qa_pairs = {};
        const student_responses = {};
        questions.forEach((question, index) => {
            qa_pairs[index + 1] = question.correct_answer;
            student_responses[index + 1] = student_answers[`question_${question.id}`];
        });

        // Send a POST request to the grading microservice
        axios.post('https://readsmartai-flaskapp-1553808f9b53.herokuapp.com/response_grader/grade', { qa_pairs, student_responses })
            .then(async response => {
                const feedbackList = response.data.feedback;

                let amountCorrect = 0;

                // Update or create StudentResponse entries
                for (let i = 0; i < feedbackList.length; i++) {
                    const feedback = feedbackList[i];
                    if (feedback.startsWith('Correct:')) {
                        amountCorrect++;
                    }
                    await new Promise((resolve, reject) => {
                        pool.query(`
                            INSERT INTO StudentResponse (student_id, assignment_id, question_id, student_answer, feedback)
                            VALUES (?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE student_answer = VALUES(student_answer), feedback = VALUES(feedback)`,
                            [student_id, assignment_id, questions[i].id, student_responses[i + 1], feedback], (error, results) => {
                                if (error) {
                                    reject(error);
                                } else {
                                    resolve(results);
                                }
                            });
                    });
                }

                let correctnessPercentage = (amountCorrect / feedbackList.length) * 100;
                correctnessPercentage = parseFloat(correctnessPercentage.toFixed(2)); // Round to 2 decimal places

                // Create a new CompletedAssignments entry
                pool.query(`
                INSERT INTO CompletedAssignments (student_id, assignment_id, correctness_percentage)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE correctness_percentage = VALUES(correctness_percentage), completion_date = CURRENT_TIMESTAMP`,
                [student_id, assignment_id, correctnessPercentage]);

                // Redirect the student to the classroom homepage
                res.redirect(`/student/classroom/${invite_code}/assignment/${assignment_id}/feedback`);
            })
            .catch(error => {
                console.error(error);
                res.status(500).send('An error occurred while grading the assignment.');
            });
    });
});

// Route for Student Assignment Feedback Page
app.get('/student/classroom/:invite_code/assignment/:id/feedback', (req, res) => {
    const invite_code = req.params.invite_code;
    const assignment_id = req.params.id;
    const student_id = req.session.userId;

    // Check if the student and assignment belong to the classroom
    pool.query(`
        SELECT * 
        FROM Classroom 
        JOIN ClassroomStudent ON Classroom.id = ClassroomStudent.classroom_id 
        JOIN Assignment ON Classroom.id = Assignment.classroom_id 
        WHERE Classroom.invite_code = ? 
        AND ClassroomStudent.student_id = ? 
        AND Assignment.id = ?`, 
        [invite_code, student_id, assignment_id], 
        (error, results) => {
            if (error) throw error;
            if (results.length > 0) {
                const classroom = results[0];
                const assignment = results[0];

                // Fetch the questions, student responses, and feedback for the assignment
                pool.query(`
                    SELECT Question.*, StudentResponse.student_answer, StudentResponse.feedback 
                    FROM Question 
                    JOIN StudentResponse ON Question.id = StudentResponse.question_id 
                    WHERE Question.assignment_id = ? AND StudentResponse.student_id = ?`, 
                    [assignment_id, student_id], 
                    (error, questions) => {
                        if (error) throw error;

                        // Fetch the correctness percentage and completion date for the assignment
                        pool.query(`
                            SELECT correctness_percentage, completion_date 
                            FROM CompletedAssignments 
                            WHERE student_id = ? AND assignment_id = ?`, 
                            [student_id, assignment_id], 
                            (error, results) => {
                                if (error) throw error;
                                const correctnessPercentage = results[0].correctness_percentage;
                                const completionDate = results[0].completion_date;

                                // Render the assignment feedback page with the assignment, questions, correctness percentage, and completion date data
                                res.render('student_assignment_feedback', { classroom, assignment, questions, correctnessPercentage, completionDate });
                            }
                        );
                    }
                );
            } else {
                // The student or assignment does not belong to the classroom, redirect to the student homepage
                res.redirect('/student/homepage');
            }
        }
    );
});






// QUESTION CREATION AND ANSWER ROUTES AND HANDLERS

// Route for question creation screen
app.get('/Teacher/classroom/:invite_code/assignment_create', (req, res) => {
    const invite_code = req.params.invite_code;
    const teacher_id = req.session.userId;

    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [invite_code], (error, classrooms) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to fetch the classroom data.');
            return;
        }

        if (classrooms.length > 0 && classrooms[0].teacher_id === teacher_id) {
            // Fetch the text sources for the teacher
            pool.query('SELECT * FROM TextSource WHERE teacher_id = ?', [teacher_id], (error, textSources) => {
                if (error) {
                    console.error('Error executing query:', error);
                    res.status(500).send('An error occurred while trying to fetch the text sources.');
                    return;
                }

                // Render the assignment creation page with the classroom and text sources
                res.render('assignment_create', {classroom: classrooms[0], textSources});
            });
        } else {
            req.flash('error', 'You are not the teacher of this classroom.');
            res.redirect('/Teacher/homepage');
        }
    });
});


// Create a new assignment and populate it with questions
app.post('/Teacher/classroom/:invite_code/assignment_create', async (req, res) => {
    console.log('Received POST request at /question with body:', req.body);

    const invite_code = req.params.invite_code;
    const teacher_id = req.session.userId;

    // Find the classroom with the given invite code
    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [invite_code], (error, classrooms) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to fetch the classroom data.');
            return;
        }

        if (classrooms.length > 0 && classrooms[0].teacher_id === teacher_id) {
            // Create a new assignment for the classroom
            pool.query('INSERT INTO Assignment (classroom_id, name) VALUES (?, ?)', [classrooms[0].id, req.body['assignment-name']], async (error, result) => {
                if (error) {
                    console.error('Error executing query:', error);
                    res.status(500).send('An error occurred while trying to create the assignment.');
                    return;
                }

                // Generate a unique job ID
                const jobId = uuidv4();

                // Store the job ID and initial status in the jobs data structure
                jobs[jobId] = { status: 'pending', result: null };

                // Define the body for the question generation request
                const body = {
                    'assignment-name': req.body['assignment-name'],
                    'text-source': req.body['text-source'],
                    'question-count': req.body['question-count'],
                    'start-page': req.body['start-page'],
                    'end-page': req.body['end-page'],
                    'use-raw-text': req.body['use-raw-text'] === 'on',
                    'raw-text': req.body['raw-text']
                };

                // Start the question generation process in the background
                generateQuestions(jobId, body, result.insertId, invite_code, result.insertId, teacher_id, req.body['see-questions-before'] === 'on');


                // Respond with the job ID
                res.json({ jobId });
            });
        } else {
            req.flash('error', 'You are not the teacher of this classroom.');
            res.redirect('/Teacher/homepage');
        }
    });
});

// A function to generate questions in the background
async function generateQuestions(jobId, body, assignmentId, invite_code, assignmentInsertId, teacher_id, seeQuestionsBefore) {
    try {
        const bodyWithTeacherId = {
            ...body,
            'teacher-id': teacher_id
        };

        const questions = await axios.post('https://readsmartai-flaskapp-1553808f9b53.herokuapp.com/question_generator/generate', bodyWithTeacherId, {timeout: 300000});

        // Insert each question into the Question table or TempQuestion table based on seeQuestionsBefore
        const tableName = seeQuestionsBefore ? 'TempQuestion' : 'Question';
        for (const qa_pair of questions.data.qa_pairs) {
            pool.query(`INSERT INTO ${tableName} (assignment_id, question_text, correct_answer) VALUES (?, ?, ?)`, [assignmentId, qa_pair[0], qa_pair[1]], (error, result) => {
                if (error) {
                    console.error('Error executing query:', error);
                }
            });
        }

        // Update the job status and result
        jobs[jobId].status = 'complete';
        jobs[jobId].result = `/Teacher/classroom/${invite_code}/assignment/${assignmentInsertId}`;
    } catch (error) {
        console.error('Error sending request to question_generator.py:', error.message);

        // Update the job status
        jobs[jobId].status = 'error';
    }
}

// Check the status of a job
app.get('/job/:jobId/status', (req, res) => {
    const jobId = req.params.jobId;

    // Get the status and result of the job
    const job = jobs[jobId];

    if (job) {
        res.json(job);
    } else {
        res.status(404).send('Job not found.');
    }
});


app.get('/Teacher/classroom/:invite_code/assignment_create/:id/question_review', (req, res) => {
    const invite_code = req.params.invite_code;
    const teacher_id = req.session.userId;
    const assignment_id = req.params.id;

    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [invite_code], (error, classrooms) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to fetch the classroom data.');
            return;
        }

        if (classrooms.length > 0 && classrooms[0].teacher_id === teacher_id) {
            // Fetch the questions from the TempQuestion table
            pool.query('SELECT * FROM TempQuestion WHERE assignment_id = ?', [assignment_id], (error, questions) => {
                if (error) {
                    console.error('Error executing query:', error);
                    res.status(500).send('An error occurred while trying to fetch the questions.');
                    return;
                }

                // Render the review_questions.ejs page with the questions
                res.render('review_questions', { questions });
            });
        } else {
            req.flash('error', 'You are not the teacher of this classroom.');
            res.redirect('/Teacher/homepage');
        }
    });
});


app.post('/Teacher/classroom/:invite_code/assignment_create/:id/question_review/edit', (req, res) => {
    const { questionId, updatedQuestion, updatedAnswer } = req.body;

    pool.query('UPDATE TempQuestion SET question_text = ?, correct_answer = ? WHERE id = ?', [updatedQuestion, updatedAnswer, questionId], (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to update the question.');
            return;
        }

        res.status(200).send('Question updated successfully.');
    });
});

app.post('/Teacher/classroom/:invite_code/assignment_create/:id/question_review/delete', (req, res) => {
    const { questionId } = req.body;

    pool.query('DELETE FROM TempQuestion WHERE id = ?', [questionId], (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to delete the question.');
            return;
        }

        res.status(200).send('Question deleted successfully.');
    });
});

app.post('/Teacher/classroom/:invite_code/assignment_create/:id/question_review/add', (req, res) => {
    const { newQuestion, newAnswer } = req.body;
    const assignment_id = req.params.id;

    pool.query('INSERT INTO TempQuestion (question_text, correct_answer, assignment_id) VALUES (?, ?, ?)', [newQuestion, newAnswer, assignment_id], (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to add the question.');
            return;
        }

        res.status(200).send('Question added successfully.');
    });
});

app.post('/Teacher/classroom/:invite_code/assignment_create/:id/question_review/finalize', (req, res) => {
    const assignment_id = req.params.id;
    const invite_code = req.params.invite_code;

    pool.query('INSERT INTO Question (question_text, correct_answer, assignment_id) SELECT question_text, correct_answer, assignment_id FROM TempQuestion WHERE assignment_id = ?', [assignment_id], (error, results) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to finalize the questions.');
            return;
        }

        pool.query('DELETE FROM TempQuestion WHERE assignment_id = ?', [assignment_id], (error, results) => {
            if (error) {
                console.error('Error executing query:', error);
                res.status(500).send('An error occurred while trying to finalize the questions.');
                return;
            }

            res.redirect(`/Teacher/classroom/${invite_code}/assignment/${assignment_id}`);
        });
    });
});









// Route for viewing teachers text sources
app.get('/Teacher/text_sources/', (req, res) => {
    const teacher_id = req.session.userId;

    // Fetch teacher
    pool.query('SELECT * FROM Teacher WHERE id = ?', [teacher_id], (error, teacherResults) => {
        if (error) throw error;
        const teacher = teacherResults[0];

        // Fetch text sources for the teacher
        pool.query('SELECT * FROM TextSource WHERE teacher_id = ?', [teacher_id], (error, textSourceResults) => {
            if (error) throw error;

            // Render the view with the teacher and text sources
            res.render('text_sources', { teacher, textSources: textSourceResults });
        });
    });
});

// Route for uploading text sources
app.get('/Teacher/text_sources/upload', (req, res) => {
    const teacher_id = req.session.userId;

    // Fetch the teacher's data
    pool.query('SELECT * FROM Teacher WHERE id = ?', [teacher_id], (error, teacherResults) => {
        if (error) throw error;
        const teacher = teacherResults[0];

        // Render the text_sources_upload page with the teacher data
        res.render('text_sources_upload', { teacher });
    });
});

// Post Request for uploading text sources
app.post('/Teacher/text_sources/upload', (req, res, next) => {
    upload.single('file')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                req.fileValidationError = 'File size is too large. Maximum size is 50MB.';
            }
        }
        next();
    });
}, async (req, res) => {
    const teacher_id = req.session.userId;
    const file = req.file;

    if (!file) {
        req.flash('error', 'File is too large! Maximum size is 50MB');
        return res.redirect('/Teacher/text_sources/upload');
    }

    const allowedTypes = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf', 'text/plain'];
    if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).send('Invalid file type. Only .doc, .docx, .pdf, and .txt files are allowed.');
    }
    if (req.fileValidationError) {
        return res.status(400).send(req.fileValidationError);
    }

    pool.query('INSERT INTO TextSource (teacher_id, name) VALUES (?, ?)', [teacher_id, file.originalname], async (error, result) => {
        if (error) {
            console.error('Error executing query:', error);
            return res.status(500).send('An error occurred while trying to save the file information.');
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient('readsmart-fstorage');
        
        // Create a blob name with the teacher_id as a prefix
        const blobName = `${teacher_id}/${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Create a readable stream from the file
        const stream = fs.createReadStream(file.path);
        const uploadOptions = { bufferSize: 4 * 1024, maxBuffers: 20 };
        const uploadBlobResponse = await blockBlobClient.uploadStream(stream, uploadOptions.bufferSize, uploadOptions.maxBuffers);

        console.log(`Upload block blob ${blobName} successfully`, uploadBlobResponse.requestId);

        res.redirect('/Teacher/text_sources/');
    });
});

// Route for calculating the tokens of a file/section of a file
app.get('/Teacher/text_sources/token_calculator', (req, res) => { 
    res.render('token_calculator');
});

// Start the server
var PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));