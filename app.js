const SUPABASE_URL = 'https://htsorgukdbfuuypiuksm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8bpn_JEYZU2YzVMC5UK3CA_9Kn4LPdm';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const studentNameInput = document.getElementById('student-name');
const btnSubmitName = document.getElementById('btn-submit-name');
const studentDisplayName = document.getElementById('student-display-name');
const classplanDescription = document.getElementById('classplan-description');
const lessonListEl = document.getElementById('lesson-list');
const tabButtons = document.querySelectorAll('.lesson-content nav.sub-tabs button');
const tabContentArea = document.getElementById('tab-content-area');

let currentStudent = null;
let currentClassPlan = null;
let lessons = [];
let currentLesson = null;
let exercises = [];

btnSubmitName.addEventListener('click', async () => {
    const name = studentNameInput.value.trim();
    if (!name) {
        alert('Please enter your name.');
        return;
    }
    await loadStudentData(name);
});

async function loadStudentData(name) {
    try {
        // Find student by name (case insensitive)
        const { data: students, error: studentError } = await supabaseClient
            .from('STUDENT')
            .select('*')
            .ilike('nome', name)
            .limit(1);

        if (studentError) throw studentError;
        if (!students || students.length === 0) {
            alert('Student not found.');
            return;
        }

        currentStudent = students[0];
        studentDisplayName.textContent = currentStudent.nome;

        // Load class plans for student
        const { data: classPlans, error: cpError } = await supabaseClient
            .from('CLASS_PLAN')
            .select('*')
            .eq('id_student', currentStudent.id);

        if (cpError) throw cpError;
        if (!classPlans || classPlans.length === 0) {
            alert('No class plans found for this student.');
            return;
        }

        // For simplicity, pick the first class plan
        currentClassPlan = classPlans[0];
        classplanDescription.textContent = currentClassPlan.description || 'Class Plan';

        // Load lessons for class plan
        const { data: classesData, error: classesError } = await supabaseClient
            .from('CLASSES')
            .select('*')
            .eq('id_class_plan', currentClassPlan.id)
            .order('title', { ascending: true });

        if (classesError) throw classesError;
        lessons = classesData || [];

        if (lessons.length === 0) {
            alert('No lessons found for this class plan.');
            return;
        }

        renderLessonList();
        selectLesson(lessons[0].id);

    } catch (error) {
        console.error('Error loading student data:', error);
        alert('Error loading data. See console for details.');
    }
}

function renderLessonList() {
    lessonListEl.innerHTML = '';
    lessons.forEach(lesson => {
        const li = document.createElement('li');
        li.textContent = lesson.title;
        li.tabIndex = 0;
        li.dataset.lessonId = lesson.id;
        li.classList.toggle('active', currentLesson && currentLesson.id === lesson.id);
        li.addEventListener('click', () => selectLesson(lesson.id));
        li.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectLesson(lesson.id);
            }
        });
        lessonListEl.appendChild(li);
    });
}

async function selectLesson(lessonId) {
    currentLesson = lessons.find(l => l.id === lessonId);
    if (!currentLesson) return;

    // Update active class in lesson list
    [...lessonListEl.children].forEach(li => {
        li.classList.toggle('active', li.dataset.lessonId === lessonId);
    });

    // Reset sub-tabs to Content
    activateSubTab('content');

    // Load exercises for this lesson
    const { data: exercisesData, error: exercisesError } = await supabaseClient
        .from('EXERCISES')
        .select('*')
        .eq('id_class', lessonId);

    if (exercisesError) {
        console.error('Error loading exercises:', exercisesError);
        exercises = [];
    } else {
        exercises = exercisesData || [];
    }

    renderContentTab();
    renderExercisesTab();
}

function activateSubTab(tabName) {
    tabButtons.forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.tabIndex = isActive ? 0 : -1;
    });
    renderTabContent(tabName);
}

tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        activateSubTab(btn.dataset.tab);
    });
});

function renderTabContent(tabName) {
    switch (tabName) {
        case 'content':
            renderContentTab();
            break;
        case 'exercises':
            renderExercisesTab();
            break;
        case 'homework':
            renderHomeworkTab();
            break;
    }
}

function renderContentTab() {
    if (!currentLesson) {
        tabContentArea.innerHTML = '<p>No lesson selected.</p>';
        return;
    }
    tabContentArea.innerHTML = `
        <h3>${currentLesson.title}</h3>
        <p><em>Type: ${currentLesson.type || 'N/A'}</em></p>
        <p>${currentLesson.description || ''}</p>
        <div>${currentLesson.content || ''}</div>
    `;
}

function renderExercisesTab() {
    if (!exercises || exercises.length === 0) {
        tabContentArea.innerHTML = '<p>No exercises available for this lesson.</p>';
        return;
    }
    // Render all exercises with their questions and inputs for answers
    let html = '';
    exercises.forEach((exercise, idx) => {
        html += `<div class="exercise-block" data-exercise-id="${exercise.id}" style="margin-bottom: 25px;">`;
        html += `<h4>Exercise ${idx + 1} (Type: ${exercise.type || 'N/A'})</h4>`;
        for (let i = 1; i <= 10; i++) {
            const question = exercise[`question_${i}`];
            if (question && question.trim() !== '') {
                html += `
                    <div class="exercise-question">
                        <label for="answer-${exercise.id}-${i}">${question}</label>
                        <input type="text" id="answer-${exercise.id}-${i}" name="answer-${exercise.id}-${i}" />
                    </div>
                `;
            }
        }
        html += '</div>';
    });
    html += `<button id="btn-save-answers">Save Answers</button>`;
    tabContentArea.innerHTML = html;

    document.getElementById('btn-save-answers').addEventListener('click', saveAnswers);
}

function renderHomeworkTab() {
    tabContentArea.innerHTML = `
        <div class="chat-container" aria-label="Chat with AI Agent" style="height: 100%; display: flex; flex-direction: column;">
            <h3>Chat with AI Agent</h3>
            <div class="chat-messages" aria-live="polite" aria-atomic="true" style="flex: 1; overflow-y: auto;">
                <em>Chat here with the AI agent to ask questions and get instant help.</em>
            </div>
            <input type="text" class="chat-input" placeholder="Type your message..." aria-label="Type your message to the AI agent" />
        </div>
    `;
}

async function saveAnswers() {
    if (!currentStudent) {
        alert('Please submit your name first.');
        return;
    }
    if (!exercises || exercises.length === 0) {
        alert('No exercises to save.');
        return;
    }

    try {
        for (const exercise of exercises) {
            const answerData = {
                id_exercise: exercise.id,
            };
            let hasAnswer = false;
            for (let i = 1; i <= 10; i++) {
                const input = document.getElementById(`answer-${exercise.id}-${i}`);
                if (input && input.value.trim() !== '') {
                    answerData[`answer_${i}`] = input.value.trim();
                    hasAnswer = true;
                }
            }
            if (!hasAnswer) continue; // Skip if no answers for this exercise

            // Check if answer record exists for this exercise and student
            const { data: existingAnswers, error: fetchError } = await supabaseClient
                .from('ANSWERS')
                .select('*')
                .eq('id_exercise', exercise.id)
                .limit(1);

            if (fetchError) throw fetchError;

            if (existingAnswers && existingAnswers.length > 0) {
                // Update existing answer
                const answerId = existingAnswers[0].id;
                const { error: updateError } = await supabaseClient
                    .from('ANSWERS')
                    .update(answerData)
                    .eq('id', answerId);

                if (updateError) throw updateError;
            } else {
                // Insert new answer
                const { error: insertError } = await supabaseClient
                    .from('ANSWERS')
                    .insert([answerData]);

                if (insertError) throw insertError;
            }
        }
        alert('Answers saved successfully.');
    } catch (error) {
        console.error('Error saving answers:', error);
        alert('Error saving answers. See console for details.');
    }
}
