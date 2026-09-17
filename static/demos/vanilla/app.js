(() => {
  const countElement = document.querySelector('#count');
  const decreaseButton = document.querySelector('#decrease');
  const increaseButton = document.querySelector('#increase');
  let count = 0;

  const render = () => {
    countElement.textContent = String(count);
  };

  decreaseButton.addEventListener('click', () => {
    count -= 1;
    render();
  });

  increaseButton.addEventListener('click', () => {
    count += 1;
    render();
  });
})();
