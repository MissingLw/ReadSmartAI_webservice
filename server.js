const express = require('express');
const app = express();
const axios = require('axios');
const path = require('path');
const argon2 = require('argon2');
const pool = require('./db-connector');
const session = require('express-session');
const flash = require('connect-flash');

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
                        const completed = assignments.filter(a => completedAssignmentIds.includes(a.id));
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
        axios.post('http://localhost:5000/response_grader/grade', { qa_pairs, student_responses })
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
                    ON DUPLICATE KEY UPDATE correctness_percentage = VALUES(correctness_percentage)`,
                    [student_id, assignment_id, correctnessPercentage]);

                // Redirect the student to the classroom homepage
                res.redirect(`/student/classroom/${invite_code}`);
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

                        // Fetch the correctness percentage for the assignment
                        pool.query(`
                            SELECT correctness_percentage 
                            FROM CompletedAssignments 
                            WHERE student_id = ? AND assignment_id = ?`, 
                            [student_id, assignment_id], 
                            (error, results) => {
                                if (error) throw error;
                                const correctnessPercentage = results[0].correctness_percentage;

                                // Render the assignment feedback page with the assignment, questions, and correctness percentage data
                                res.render('student_assignment_feedback', { classroom, assignment, questions, correctnessPercentage });
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

    // console.log(`invite_code: ${invite_code}, teacher_id: ${teacher_id}`);

    pool.query('SELECT * FROM Classroom WHERE invite_code = ?', [invite_code], (error, classrooms) => {
        if (error) {
            console.error('Error executing query:', error);
            res.status(500).send('An error occurred while trying to fetch the classroom data.');
            return;
        }

        // console.log(classrooms);

        if (classrooms.length > 0 && classrooms[0].teacher_id === teacher_id) {
            res.render('assignment_create', {classroom: classrooms[0]});
            // res.render('login_teacher');
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

                // Send a request to the question_generator.py microservice
                try {
                    const questions = await axios.post('http://localhost:5000/question_generator/generate', req.body);
                    console.log('Received questions from question_generator.py:', questions.data);

                    // Insert each question into the Question table
                    for (const qa_pair of questions.data.qa_pairs) {
                        pool.query('INSERT INTO Question (assignment_id, question_text, correct_answer) VALUES (?, ?, ?)', [result.insertId, qa_pair[0], qa_pair[1]], (error, result) => {
                            if (error) {
                                console.error('Error executing query:', error);
                            }
                        });
                    }

                    req.session.qa_pairs = questions.data.qa_pairs; // Save the questions in the session TODO
                    res.redirect('/answer');
                } catch (error) {
                    console.error('Error sending request to question_generator.py:', error.message);
                    res.status(500).send('An error occurred while generating the questions.');
                }
            });
        } else {
            req.flash('error', 'You are not the teacher of this classroom.');
            res.redirect('/Teacher/homepage');
        }
    });
});

// Route for answer screen
app.get('/answer', (req, res) => {
    console.log('Received GET request at /answer');
    res.render('answer', { qa_pairs: req.session.qa_pairs }); // Pass the questions to the answer.ejs file
});

// New route handler for /qa_pairs
app.get('/qa_pairs', (req, res) => {
    console.log('Received GET request at /qa_pairs');
    res.json(req.session.qa_pairs);
});

app.post('/answer', async (req, res) => {
    console.log('Received POST request at /answer with body:', req.body);
    // Send a request to the response_grader.py microservice
    try {
        const feedback = await axios.post('http://localhost:5000/response_grader/grade', {
            qa_pairs: req.session.qa_pairs,
            student_responses: req.body.answers.reduce((obj, answer, i) => {
                obj[`Question ${i + 1}`] = answer;
                return obj;
            }, {}),
        });
        console.log('Received feedback from response_grader.py:', feedback.data);
        // Return the feedback as a JSON object
        res.json({ feedback: feedback.data.feedback });
    } catch (error) {
        console.error('Error sending request to response_grader.py:', error.message);
        res.status(500).send('An error occurred while grading the answers.');
    }
});






// Start the server
var PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${port}`));