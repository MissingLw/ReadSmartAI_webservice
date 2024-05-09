$(document).ready(function() {
    $('.edit-button').click(function() {
        const questionId = $(this).data('question-id');
        const updatedQuestion = prompt('Enter the updated question:');
        const updatedAnswer = prompt('Enter the updated answer:');

        $.post(`/Teacher/classroom/:invite_code/assignment_create/:id/question_review/edit`, { questionId, updatedQuestion, updatedAnswer }, function(data) {
            location.reload();
        });
    });

    $('.delete-button').click(function() {
        const questionId = $(this).data('question-id');

        $.post(`/Teacher/classroom/:invite_code/assignment_create/:id/question_review/delete`, { questionId }, function(data) {
            location.reload();
        });
    });

    $('#add-button').click(function() {
        const newQuestion = prompt('Enter the new question:');
        const newAnswer = prompt('Enter the new answer:');

        $.post(`/Teacher/classroom/:invite_code/assignment_create/:id/question_review/add`, { newQuestion, newAnswer }, function(data) {
            location.reload();
        });
    });

    $('#finalize-button').click(function() {
        $.post(`/Teacher/classroom/:invite_code/assignment_create/:id/question_review/finalize`, function(data) {
            location.reload();
        });
    });
});