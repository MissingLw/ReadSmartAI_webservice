// Populate the dropdown
window.onload = function() {
    try {
        // Define your sources
        var sources = ["", "tell_tale_heart", "most_dangerous_game", "lamb_to_the_slaughter", "daedalus_and_icarus"];

        // Get the dropdown element
        var dropdown = document.getElementById("text-source");
        if (!dropdown) {
            console.error('Could not find element with id "text-source"');
            return;
        }

        // Create an option element for each source
        for (var i = 0; i < sources.length; i++) {
            var option = document.createElement("option");
            option.value = sources[i];
            option.text = sources[i];
            dropdown.add(option);
        }
    } catch (error) {
        console.error('Error in window.onload function:', error);
    }
}

// Event listener for form submission
document.getElementById('question-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const textSource = document.getElementById('text-source').value;
    const numQuestions = document.getElementById('num-questions').value;
    try {
        const response = await axios.post('/question', { textSource, numQuestions });
        window.location.href = '/answer';
    } catch (error) {
        console.error('Error making POST request:', error);
    }
});