const contactButton = document.querySelector('.contact-button');

contactButton?.addEventListener('click', (event) => {
  if (contactButton.getAttribute('href') === 'mailto:ola@example.com') {
    event.preventDefault();
    window.alert('Troque ola@example.com pelo seu email para receber mensagens.');
  }
});
