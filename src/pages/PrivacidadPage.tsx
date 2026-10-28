import { PieLegal } from '../components/PieLegal';
import { VERSION_PRIVACIDAD } from '../legal/versiones';

export function PrivacidadPage() {
  return (
    <div className="pagina-publica">
      <main className="documento-legal">
        <header className="documento-legal__cabecera">
          <p className="documento-legal__marca">Kine</p>
          <h1>Política de Privacidad</h1>
          <p className="tenue">Versión y vigencia: {VERSION_PRIVACIDAD}</p>
        </header>

        <div className="aviso aviso--aviso">
          Esta política explica el tratamiento realizado por Kine. No reemplaza las obligaciones propias del profesional o
          la clínica respecto de sus pacientes y sus historias clínicas.
        </div>

        <section>
          <h2>1. Responsable y roles</h2>
          <p>
            Luciano Sottile, CUIT 20-41197971-8, Corrientes 886, Azul, Provincia de Buenos Aires, CP 7300, es responsable de
            los datos de cuenta, soporte y facturación del servicio alojado. Contacto:{' '}
            <a href="mailto:lucianodsottile@gmail.com">lucianodsottile@gmail.com</a>.
          </p>
          <p>
            Respecto de la información clínica que carga cada profesional o clínica, Kine actúa como prestador tecnológico.
            La persona usuaria determina por qué y cómo trata esos datos y debe contar con la autorización y base legal
            correspondientes.
          </p>
        </section>

        <section>
          <h2>2. Datos tratados</h2>
          <ul>
            <li>cuenta y autenticación: correo, identificadores y datos básicos del proveedor de acceso;</li>
            <li>pagos manuales: modalidad, referencia administrativa, período abonado, estado y fecha de registro;</li>
            <li>identificadores históricos de Mercado Pago generados antes del cambio al registro manual;</li>
            <li>soporte y seguridad: mensajes, diagnósticos técnicos y registros mínimos de eventos;</li>
            <li>contenido profesional y clínico: pacientes, evaluaciones, sesiones, centros, ejercicios y adjuntos;</li>
            <li>respaldo opcional: configuración y tokens protegidos necesarios para Google Drive.</li>
          </ul>
          <p>Kine no procesa pagos ni recibe o almacena datos de tarjetas.</p>
        </section>

        <section>
          <h2>3. Finalidades</h2>
          <p>
            Los datos se usan para autenticar, prestar y proteger el servicio; guardar y exportar información; registrar y
            conciliar pagos manuales; responder soporte; realizar respaldos solicitados; prevenir abuso y cumplir obligaciones
            legales. Kine no vende datos personales ni clínicos.
          </p>
        </section>

        <section>
          <h2>4. Proveedores y destinatarios</h2>
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Función</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>GitHub Pages</td>
                  <td>Publicación de la aplicación web y sus archivos estáticos.</td>
                </tr>
                <tr>
                  <td>Supabase</td>
                  <td>Autenticación, base de datos, almacenamiento de adjuntos y funciones de servidor.</td>
                </tr>
                <tr>
                  <td>Mercado Pago</td>
                  <td>Conservación y conciliación de identificadores históricos; Kine no inicia cobros nuevos.</td>
                </tr>
                <tr>
                  <td>Google</td>
                  <td>Inicio de sesión y respaldo en Drive cuando la persona elige esas funciones.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Estos proveedores reciben únicamente los datos necesarios para su función y aplican sus propios términos y
            políticas.
          </p>
        </section>

        <section>
          <h2>5. Transferencias internacionales</h2>
          <p>
            La infraestructura de Supabase utilizada por Kine está alojada en <strong>São Paulo, Brasil</strong>. GitHub,
            Google y, para los registros históricos, Mercado Pago también pueden procesar información fuera de Argentina según su infraestructura. Al usar
            el servicio se informa esta transferencia internacional; Kine procurará utilizar consentimiento y mecanismos
            contractuales adecuados cuando correspondan. Antes de cargar datos sensibles, el profesional debe verificar que
            su tratamiento y las transferencias cumplen las exigencias aplicables.
          </p>
        </section>

        <section>
          <h2>6. Seguridad y confidencialidad</h2>
          <p>
            Kine aplica autenticación, reglas de acceso por cuenta, almacenamiento privado, cifrado en tránsito y acceso
            restringido a secretos operativos. Ningún sistema es absolutamente seguro. Ante un incidente se evaluará su
            alcance y se realizarán las comunicaciones exigidas por la normativa aplicable.
          </p>
        </section>

        <section>
          <h2>7. Conservación y eliminación</h2>
          <p>
            Mientras la cuenta tiene acceso, la información se conserva para prestar el servicio. Después de terminar el
            acceso, Kine conserva su copia por un año para permitir la exportación o reactivación y luego la elimina
            automáticamente. Puede solicitarse eliminación anticipada por correo, sujeta a obligaciones legales.
          </p>
          <p>
            Kine no controla ni elimina copias descargadas, carpetas sincronizadas o respaldos guardados en el Google Drive
            de la persona usuaria. El profesional debe conservar la historia clínica durante el plazo legal de la Ley 26.529.
          </p>
        </section>

        <section>
          <h2>8. Derechos de las personas</h2>
          <p>
            La Ley 25.326 reconoce derechos de información, acceso, rectificación y supresión. Para ejercerlos, escribí a{' '}
            <a href="mailto:lucianodsottile@gmail.com">lucianodsottile@gmail.com</a> e identificá la cuenta y el pedido. Se
            responderá dentro de los plazos legales y podrán solicitarse elementos razonables para verificar identidad.
          </p>
          <p>
            La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, recibe denuncias y reclamos de
            quienes resulten afectados en sus derechos. Más información en{' '}
            <a href="https://www.argentina.gob.ar/aaip" target="_blank" rel="noreferrer">
              argentina.gob.ar/aaip
            </a>
            .
          </p>
        </section>

        <section>
          <h2>9. Cambios</h2>
          <p>
            Los cambios materiales a esta política se informarán con al menos 14 días corridos de anticipación y se
            solicitará una nueva aceptación cuando corresponda.
          </p>
        </section>
      </main>
      <PieLegal />
    </div>
  );
}
