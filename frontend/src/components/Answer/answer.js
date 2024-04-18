window.onload = async function() {
    var container = document.getElementById('qa-container');
    console.log(container); // Log the container element

    // Fetch the qa_pairs from the server
    const response = await axios.get('/qa_pairs');
    const qa_pairs = response.data.qa_pairs; 
    console.log(qa_pairs); // Log the question-answer pairs

    console.log(qa_pairs.length); // Log the length of qa_pairs
    console.log(qa_pairs[0][0]); // Log the first question

    // Create a question and answer field for each question-answer pair
    for (var i = 0; i < qa_pairs.length; i++) {
        console.log(`Creating question-answer pair ${i}`); 

        var question = document.createElement('p');
        question.textContent = qa_pairs[i][0];
        container.appendChild(question);
        console.log(`Added question ${i}`); 

        var answer = document.createElement('input');
        answer.type = 'text';
        answer.className = 'answer';
        container.appendChild(answer);
        console.log(`Added answer ${i}`); 
    }

    
    document.getElementById('back-button').addEventListener('click', () => {
        window.location.href = '/'; 
    });
}

document.getElementById('submit-answers').addEventListener('click', async () => {
    const answers = Array.from(document.getElementsByClassName('answer')).map(input => input.value);
    const response = await axios.post('/answer', { answers });
    console.log(response);  
    document.getElementById('feedback').innerHTML = response.data.feedback.join('<br>');
});