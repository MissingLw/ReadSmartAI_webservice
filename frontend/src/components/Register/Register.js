window.onload = function() {
    var form = document.getElementById('registerForm');
    form.onsubmit = function(e) {
        var password = document.getElementById('password').value;
        var confirmPassword = document.getElementById('confirmPassword').value;

        if (password !== confirmPassword) {
            alert('Passwords do not match.');
            e.preventDefault(); // prevent form from submitting
        }
    };
};