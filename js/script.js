const handleZipCode = (event) => {
    let input = event.target
    input.value = zipCodeMask(input.value)
}
  
const zipCodeMask = (value) => {
    if (!value) return ""
    value = value.replace(/\D/g,'')
    value = value.replace(/(\d{5})(\d)/,'$1-$2')
    return value
}
function buscarCep(){
    let input = document.getElementById('cep').value;

    const ajax = new XMLHttpRequest();
    ajax.open('Get' ,'https://viacep.com.br/ws/'+input+'/json/');
    ajax.send();

    ajax.onload = function(){
        let obj = JSON.parse(this.responseText);
        let logradouro = obj.logradouro;
        let complemento = obj.complemento;
        let bairro = obj.bairro;
        let cidade = obj.localidade;
        let estado = obj.uf;

        document.getElementById('text').innerHTML = 
        "<b>Logradouro:</b> " +logradouro + 
        "<br><b>Complemento:</b> " +complemento+ 
        "<br><b>Cidade:</b> " + cidade + 
        "<br><b>Estado:</b> " + estado +
        "<br><b>Bairro:</b> "+ bairro ;
    }
}

function limparForm(){
    document.getElementById('cep').value='';
    document.getElementById('text').innerHTML ='';
}